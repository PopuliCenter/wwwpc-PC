import { AuthenticatedRequest } from '@modules/auth/interfaces';
import {
  Controller,
  Get,
  Delete,
  Body,
  Query,
  Req,
  Res,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '@modules/auth/guards/jwt-auth.guard';
import { RolesGuard } from '@modules/auth/guards/roles.guard';
import { Roles } from '@modules/auth/decorators';
import { UserRole, AuditActionType } from '@shared/enums';
import { AuditService } from '@modules/audit/audit.service';
import { S3StorageService } from './s3-storage.service';
import { DeleteObjectsDto } from './dto/delete-objects.dto';

/**
 * Panel admin penyimpanan (MinIO/S3): telusur, lihat, dan HAPUS berkas mentah
 * (unggahan responden: foto/video/audio/tanda tangan, & file export).
 *
 * HANYA super_admin — operasi ini langsung ke storage & bisa menghapus berkas
 * yang masih dirujuk respons. Gunakan untuk pembersihan/koreksi.
 */
@Controller('admin/storage')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.SUPER_ADMIN)
export class StorageController {
  constructor(
    private readonly s3: S3StorageService,
    private readonly audit: AuditService,
  ) {}

  /** Hanya izinkan dua bucket yang dikenal (cegah akses bucket sembarang). */
  private bucketFor(bucket?: string): string {
    return bucket === 'exports' ? this.s3.exportsBucket : this.s3.uploadsBucket;
  }

  /** Daftar objek di bucket (paginasi via token). */
  @Get('objects')
  async list(
    @Query('bucket') bucket?: string,
    @Query('prefix') prefix?: string,
    @Query('token') token?: string,
  ) {
    const result = await this.s3.listObjects(this.bucketFor(bucket), prefix ?? '', token);
    return { bucket: bucket === 'exports' ? 'exports' : 'uploads', ...result };
  }

  /** Stream isi objek (untuk pratinjau/unduh di admin). Butuh auth. */
  @Get('object')
  async getObject(
    @Query('key') key: string,
    @Res() res: Response,
    @Query('bucket') bucket?: string,
  ): Promise<void> {
    if (!key) throw new BadRequestException('Parameter "key" wajib diisi.');
    const { buffer, contentType } = await this.s3.getObjectBuffer(key, this.bucketFor(bucket));
    res.set('Content-Type', contentType);
    res.set('Cache-Control', 'private, max-age=60');
    res.send(buffer);
  }

  /** Hapus objek. PERMANEN — tercatat di Audit Log (siapa hapus apa). */
  @Delete('object')
  async deleteObject(
    @Query('key') key: string,
    @Req() req: AuthenticatedRequest,
    @Query('bucket') bucket?: string,
  ): Promise<{ ok: true }> {
    if (!key) throw new BadRequestException('Parameter "key" wajib diisi.');
    const resolvedBucket = bucket === 'exports' ? 'exports' : 'uploads';
    await this.s3.deleteObject(key, this.bucketFor(bucket));
    await this.audit.log({
      userId: req.user.userId,
      actionType: AuditActionType.DATA_CLEANUP,
      module: 'export',
      details: { action: 'storage_delete', bucket: resolvedBucket, key },
      ipAddress: req.ip || '0.0.0.0',
    });
    return { ok: true };
  }

  /**
   * Hapus banyak objek sekaligus (pilih-banyak). PERMANEN — tercatat di Audit
   * Log sebagai satu entri berisi daftar key. Mengembalikan key yang gagal.
   */
  @Delete('objects')
  async deleteObjects(
    @Body() dto: DeleteObjectsDto,
    @Req() req: AuthenticatedRequest,
  ): Promise<{ ok: true; deleted: string[]; failed: string[] }> {
    const resolvedBucket = dto.bucket === 'exports' ? 'exports' : 'uploads';
    const target = this.bucketFor(dto.bucket);
    const deleted: string[] = [];
    const failed: string[] = [];
    for (const key of dto.keys) {
      try {
        await this.s3.deleteObject(key, target);
        deleted.push(key);
      } catch {
        failed.push(key);
      }
    }
    if (deleted.length > 0) {
      await this.audit.log({
        userId: req.user.userId,
        actionType: AuditActionType.DATA_CLEANUP,
        module: 'export',
        details: {
          action: 'storage_delete_bulk',
          bucket: resolvedBucket,
          count: deleted.length,
          keys: deleted,
        },
        ipAddress: req.ip || '0.0.0.0',
      });
    }
    return { ok: true, deleted, failed };
  }
}
