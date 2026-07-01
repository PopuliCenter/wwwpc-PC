import { Injectable, Logger } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { S3StorageService } from '@modules/export/s3-storage.service';
import { FileValidationService, UploadedFileLike } from './file-validation.service';

export interface UploadResult {
  /** S3 object key — this is what the respondent stores as the answer value. */
  key: string;
  /** Time-limited pre-signed URL so the UI can show a preview. */
  url: string;
  originalName: string;
}

@Injectable()
export class FileUploadService {
  private readonly logger = new Logger(FileUploadService.name);

  constructor(
    private readonly fileValidation: FileValidationService,
    private readonly s3: S3StorageService,
  ) {}

  /**
   * Validate and store a respondent's uploaded file. The object key is scoped
   * to the survey and respondent so answer validation can verify ownership.
   */
  async uploadAnswerFile(
    surveyId: string,
    respondentId: string,
    file: UploadedFileLike | undefined,
  ): Promise<UploadResult> {
    const { ext, contentType } = this.fileValidation.validate(file);

    // Unggahan responden → bucket UPLOADS (terpisah dari file export).
    // Sisipkan nama asli berkas (di-sanitasi) agar mudah dikenali di panel
    // admin, lalu UUID di belakang menjaga keunikan. Prefix tetap
    // `survey-uploads/<surveyId>/<respondentId>/` agar validasi kepemilikan jalan.
    const safeName = this.safeBaseName(file!.originalname);
    const key = `survey-uploads/${surveyId}/${respondentId}/${safeName}-${uuidv4()}.${ext}`;
    await this.s3.uploadBuffer(file!.buffer, key, contentType, this.s3.uploadsBucket);
    const url = await this.s3.getPresignedDownloadUrl(key, this.s3.uploadsBucket);

    this.logger.log(`Respondent ${respondentId} uploaded file for survey ${surveyId}: ${key}`);

    return { key, url, originalName: file!.originalname };
  }

  /**
   * Sanitasi nama asli berkas untuk dijadikan bagian key S3: buang path &
   * ekstensi (ekstensi tervalidasi ditambahkan terpisah), ganti karakter tak
   * aman dengan '_', batasi panjang. Mengembalikan 'berkas' bila kosong.
   */
  private safeBaseName(originalName: string | undefined): string {
    const raw = (originalName ?? '').split(/[\\/]/).pop() ?? '';
    const base = raw
      .replace(/\.[^.]+$/, '') // buang ekstensi asli
      .normalize('NFKD')
      .replace(/[^\w.-]+/g, '_')
      .replace(/_+/g, '_')
      .replace(/^[._-]+|[._-]+$/g, '')
      .slice(0, 60);
    return base || 'berkas';
  }
}
