import { Injectable, Logger, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadBucketCommand,
  CreateBucketCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class S3StorageService {
  private readonly logger = new Logger(S3StorageService.name);
  private readonly s3Client: S3Client;
  private readonly bucket: string;

  /** How long (seconds) a pre-signed download URL stays valid. Default: 15 minutes. */
  private readonly presignedUrlExpiresIn: number;

  constructor(private readonly configService: ConfigService) {
    const endpoint = this.configService.get<string>('S3_ENDPOINT');
    const accessKeyId = this.configService.get<string>('S3_ACCESS_KEY');
    const secretAccessKey = this.configService.get<string>('S3_SECRET_KEY');
    const region = this.configService.get<string>('S3_REGION') ?? 'us-east-1';
    const useSSL = this.configService.get<string>('S3_USE_SSL') === 'true';

    this.bucket = this.configService.get<string>('S3_BUCKET') ?? 'survey-exports';
    this.presignedUrlExpiresIn = parseInt(
      this.configService.get<string>('S3_PRESIGNED_URL_EXPIRES_IN') ?? '900',
      10,
    );

    this.s3Client = new S3Client({
      region,
      // When an explicit endpoint is set (MinIO / local S3-compatible), use path-style addressing.
      ...(endpoint
        ? {
            endpoint,
            forcePathStyle: true,
            tls: useSSL,
          }
        : {}),
      credentials:
        accessKeyId && secretAccessKey
          ? { accessKeyId, secretAccessKey }
          : undefined,
    });
  }

  /**
   * Upload a local file to S3/MinIO and return the S3 object key.
   * The local file is deleted after a successful upload.
   *
   * @param localFilePath  Absolute path to the file on disk
   * @param s3Key          Destination key inside the bucket (e.g. "exports/export-<id>.csv")
   * @param contentType    MIME type for the object
   */
  async uploadFile(
    localFilePath: string,
    s3Key: string,
    contentType: string,
  ): Promise<string> {
    let fileBuffer: Buffer;
    try {
      fileBuffer = fs.readFileSync(localFilePath);
    } catch (err: any) {
      throw new InternalServerErrorException(
        `Failed to read local file for upload: ${err.message}`,
      );
    }

    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: s3Key,
          Body: fileBuffer,
          ContentType: contentType,
          // No ACL → bucket/object remains private (server-side default)
        }),
      );
      this.logger.log(`Uploaded ${s3Key} to bucket '${this.bucket}'`);
    } catch (err: any) {
      throw new InternalServerErrorException(
        `S3 upload failed for key '${s3Key}': ${err.message}`,
      );
    }

    // Clean up local temp file after successful upload
    try {
      fs.unlinkSync(localFilePath);
      this.logger.debug(`Deleted local temp file: ${localFilePath}`);
    } catch (cleanupErr: any) {
      // Non-fatal — log only
      this.logger.warn(`Could not delete local temp file '${localFilePath}': ${cleanupErr.message}`);
    }

    return s3Key;
  }

  /**
   * Upload an in-memory buffer to S3/MinIO and return the object key.
   * Used for respondent file uploads where the bytes never touch local disk.
   */
  async uploadBuffer(
    buffer: Buffer,
    s3Key: string,
    contentType: string,
  ): Promise<string> {
    try {
      await this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucket,
          Key: s3Key,
          Body: buffer,
          ContentType: contentType,
          // No ACL → object remains private (served via pre-signed URLs only)
        }),
      );
      this.logger.log(`Uploaded buffer to ${s3Key} in bucket '${this.bucket}'`);
      return s3Key;
    } catch (err: any) {
      throw new InternalServerErrorException(
        `S3 buffer upload failed for key '${s3Key}': ${err.message}`,
      );
    }
  }

  /**
   * Generate a time-limited, pre-signed GET URL for a private S3 object.
   * The URL expires after `S3_PRESIGNED_URL_EXPIRES_IN` seconds (default 900 = 15 min).
   *
   * @param s3Key  The object key inside the bucket
   */
  async getPresignedDownloadUrl(s3Key: string): Promise<string> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucket,
        Key: s3Key,
      });

      const url = await getSignedUrl(this.s3Client, command, {
        expiresIn: this.presignedUrlExpiresIn,
      });

      this.logger.debug(
        `Generated pre-signed URL for '${s3Key}' (expires in ${this.presignedUrlExpiresIn}s)`,
      );
      return url;
    } catch (err: any) {
      throw new InternalServerErrorException(
        `Failed to generate pre-signed URL for '${s3Key}': ${err.message}`,
      );
    }
  }

  /**
   * Ambil isi objek dari S3/MinIO sebagai buffer (untuk di-stream ke klien lewat
   * backend — MinIO bersifat internal, jadi presigned URL tak dapat diakses browser).
   */
  async getObjectBuffer(s3Key: string): Promise<{ buffer: Buffer; contentType: string }> {
    try {
      const res = await this.s3Client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: s3Key }),
      );
      const bytes = await (res.Body as any).transformToByteArray();
      return {
        buffer: Buffer.from(bytes),
        contentType: res.ContentType ?? 'application/octet-stream',
      };
    } catch (err: any) {
      throw new InternalServerErrorException(
        `Failed to read S3 object '${s3Key}': ${err.message}`,
      );
    }
  }

  /**
   * Delete an object from S3/MinIO (e.g. after scheduled cleanup).
   */
  async deleteObject(s3Key: string): Promise<void> {
    try {
      await this.s3Client.send(
        new DeleteObjectCommand({ Bucket: this.bucket, Key: s3Key }),
      );
      this.logger.log(`Deleted S3 object: ${s3Key}`);
    } catch (err: any) {
      this.logger.warn(`Failed to delete S3 object '${s3Key}': ${err.message}`);
    }
  }

  /**
   * Ensure the target bucket exists. Creates it if missing.
   * Safe to call on startup (idempotent).
   */
  async ensureBucketExists(): Promise<void> {
    try {
      await this.s3Client.send(new HeadBucketCommand({ Bucket: this.bucket }));
      this.logger.log(`S3 bucket '${this.bucket}' is accessible`);
    } catch {
      this.logger.warn(`Bucket '${this.bucket}' not found — attempting to create it`);
      try {
        await this.s3Client.send(new CreateBucketCommand({ Bucket: this.bucket }));
        this.logger.log(`Created S3 bucket '${this.bucket}'`);
      } catch (createErr: any) {
        throw new InternalServerErrorException(
          `Could not create S3 bucket '${this.bucket}': ${createErr.message}`,
        );
      }
    }
  }

  /**
   * Derive the S3 object key from a stored file_path.
   *
   * Stored paths may be either:
   *  - A bare S3 key  (e.g. "exports/export-abc.csv")  ← new format after this change
   *  - An absolute local path (legacy, pre-S3 entries)
   *
   * Returns the key portion only.
   */
  static resolveS3Key(storedPath: string): string {
    // If the path contains a directory separator it may be a legacy local path.
    // Extract just the filename and place it under the "exports/" prefix.
    const baseName = path.basename(storedPath);
    if (!storedPath.startsWith('exports/')) {
      return `exports/${baseName}`;
    }
    return storedPath;
  }

  /** Map file extension to MIME content-type for S3 metadata. */
  static contentTypeFor(extension: string): string {
    const map: Record<string, string> = {
      csv: 'text/csv',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      pdf: 'application/pdf',
      json: 'application/json',
    };
    return map[extension.toLowerCase()] ?? 'application/octet-stream';
  }
}
