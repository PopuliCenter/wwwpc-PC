import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { UserRole } from '@shared/enums';

/** Identitas pemanggil untuk otorisasi akses job export (M7). */
export interface ExportRequester {
  id: string;
  role: UserRole;
}
import { InjectQueue } from '@nestjs/bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Queue } from 'bull';
import { ExportJob } from './entities/export-job.entity';
import { S3StorageService } from './s3-storage.service';
import { ExportFormat, ExportStatus, ResponseFilter, AuditFilter } from './interfaces';
import {
  EXPORT_QUEUE,
  EXPORT_CSV_JOB,
  EXPORT_EXCEL_JOB,
  EXPORT_PDF_JOB,
  EXPORT_JSON_JOB,
  EXPORT_AUDIT_LOG_JOB,
  EXPORT_MANUAL_REWARD_JOB,
  EXPORT_RETRY_ATTEMPTS,
  EXPORT_RETRY_DELAY,
  EXPORT_BACKOFF_TYPE,
} from './constants';

/**
 * Bersihkan teks agar aman jadi bagian nama file: buang tanda baca, ubah spasi
 * jadi tanda hubung, batasi panjang. Huruf Indonesia (ASCII) tetap terbaca.
 */
function safeFilePart(input: string): string {
  const cleaned = input
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 80);
  return cleaned || 'export';
}

@Injectable()
export class ExportService {
  private readonly logger = new Logger(ExportService.name);

  constructor(
    @InjectQueue(EXPORT_QUEUE)
    private readonly exportQueue: Queue,
    @InjectRepository(ExportJob)
    private readonly exportJobRepository: Repository<ExportJob>,
    private readonly s3StorageService: S3StorageService,
  ) {}

  /**
   * Export survey responses as CSV (raw response data).
   * Runs as a background job via BullMQ.
   */
  async exportCsv(
    surveyId: string,
    filters: ResponseFilter,
    requestedBy: string,
  ): Promise<ExportJob> {
    return this.createExportJob(ExportFormat.CSV, EXPORT_CSV_JOB, surveyId, filters, requestedBy);
  }

  /**
   * Export survey responses as Excel with response data and summary statistics.
   * Runs as a background job via BullMQ.
   */
  async exportExcel(
    surveyId: string,
    filters: ResponseFilter,
    requestedBy: string,
  ): Promise<ExportJob> {
    return this.createExportJob(
      ExportFormat.EXCEL,
      EXPORT_EXCEL_JOB,
      surveyId,
      filters,
      requestedBy,
    );
  }

  /**
   * Export survey responses as PDF with visual report (charts).
   * Runs as a background job via BullMQ.
   */
  async exportPdf(
    surveyId: string,
    filters: ResponseFilter,
    requestedBy: string,
  ): Promise<ExportJob> {
    return this.createExportJob(ExportFormat.PDF, EXPORT_PDF_JOB, surveyId, filters, requestedBy);
  }

  /**
   * Export survey responses as structured JSON.
   * Runs as a background job via BullMQ.
   */
  async exportJson(
    surveyId: string,
    filters: ResponseFilter,
    requestedBy: string,
  ): Promise<ExportJob> {
    return this.createExportJob(ExportFormat.JSON, EXPORT_JSON_JOB, surveyId, filters, requestedBy);
  }

  /**
   * Export audit log entries as CSV.
   * Runs as a background job via BullMQ.
   */
  async exportAuditLog(filters: AuditFilter, requestedBy: string): Promise<ExportJob> {
    const exportJob = this.exportJobRepository.create({
      requestedBy,
      format: ExportFormat.CSV,
      status: ExportStatus.PENDING,
      filtersApplied: filters as Record<string, any>,
    });

    const savedJob = await this.exportJobRepository.save(exportJob);

    await this.exportQueue.add(
      EXPORT_AUDIT_LOG_JOB,
      {
        exportJobId: savedJob.id,
        filters,
        requestedBy,
      },
      {
        attempts: EXPORT_RETRY_ATTEMPTS,
        backoff: { type: EXPORT_BACKOFF_TYPE, delay: EXPORT_RETRY_DELAY },
        removeOnComplete: true,
      },
    );

    this.logger.log(`Queued audit log export job: ${savedJob.id}`);
    return savedJob;
  }

  /**
   * Extract manual reward data including name, destination number, and completion status.
   * Runs as a background job via BullMQ.
   */
  async extractManualRewardData(surveyId: string, requestedBy: string): Promise<ExportJob> {
    const exportJob = this.exportJobRepository.create({
      requestedBy,
      format: ExportFormat.CSV,
      status: ExportStatus.PENDING,
      filtersApplied: { surveyId, type: 'manual_reward' },
    });

    const savedJob = await this.exportJobRepository.save(exportJob);

    await this.exportQueue.add(
      EXPORT_MANUAL_REWARD_JOB,
      {
        exportJobId: savedJob.id,
        surveyId,
        requestedBy,
      },
      {
        attempts: EXPORT_RETRY_ATTEMPTS,
        backoff: { type: EXPORT_BACKOFF_TYPE, delay: EXPORT_RETRY_DELAY },
        removeOnComplete: true,
      },
    );

    this.logger.log(`Queued manual reward export job: ${savedJob.id}`);
    return savedJob;
  }

  /**
   * Get the current status of an export job.
   */
  /**
   * Cegah pengguna mengakses job export milik orang lain (M7). Analyst hanya
   * boleh job miliknya; ADMIN/SUPER_ADMIN boleh semua (koordinasi). Tanpa cek,
   * siapa pun yang menebak jobId (UUID) bisa mengunduh data sensitif (nama,
   * telepon, nomor tujuan reward) survei yang bukan haknya.
   */
  private assertJobAccess(job: ExportJob, requester?: ExportRequester): void {
    if (!requester) return; // pemanggil internal tanpa konteks user
    const privileged =
      requester.role === UserRole.SUPER_ADMIN || requester.role === UserRole.ADMIN;
    if (job.requestedBy && job.requestedBy !== requester.id && !privileged) {
      throw new ForbiddenException('Anda tidak berhak mengakses export ini.');
    }
  }

  async getExportStatus(jobId: string, requester?: ExportRequester): Promise<ExportJob> {
    const job = await this.exportJobRepository.findOne({
      where: { id: jobId },
    });

    if (!job) {
      throw new NotFoundException(`Export job with id ${jobId} not found`);
    }

    this.assertJobAccess(job, requester);
    return job;
  }

  /**
   * Generate a time-limited pre-signed download URL for a completed export job.
   * The caller receives a URL that expires (default 15 min) — the S3 object
   * itself remains private and is never publicly accessible.
   */
  async downloadExport(
    jobId: string,
    requester?: ExportRequester,
  ): Promise<{ presignedUrl: string; format: ExportFormat }> {
    const job = await this.exportJobRepository.findOne({
      where: { id: jobId },
    });

    if (!job) {
      throw new NotFoundException(`Export job with id ${jobId} not found`);
    }

    this.assertJobAccess(job, requester);

    if (job.status !== ExportStatus.COMPLETED) {
      throw new NotFoundException(
        `Export job ${jobId} is not yet completed. Current status: ${job.status}`,
      );
    }

    if (!job.filePath) {
      throw new NotFoundException(`Export file not found for job ${jobId}`);
    }

    // Resolve S3 key (handles both new "exports/<file>" keys and legacy local paths)
    const s3Key = S3StorageService.resolveS3Key(job.filePath);
    const presignedUrl = await this.s3StorageService.getPresignedDownloadUrl(s3Key);

    this.logger.log(`Generated pre-signed download URL for export job ${jobId}`);
    return { presignedUrl, format: job.format };
  }

  /**
   * Ambil file export selesai sebagai buffer untuk di-stream lewat backend
   * (download yang bisa diakses browser tanpa membuka MinIO ke publik).
   * Nama file unduhan disesuaikan dengan judul survei + tanggal agar mudah
   * dikenali (mis. "Respons-Survei-Kepuasan-2026-06-17.xlsx").
   */
  async getExportFile(
    jobId: string,
    requester?: ExportRequester,
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    const job = await this.exportJobRepository.findOne({ where: { id: jobId } });
    if (!job) {
      throw new NotFoundException(`Export job with id ${jobId} not found`);
    }
    this.assertJobAccess(job, requester);
    if (job.status !== ExportStatus.COMPLETED || !job.filePath) {
      throw new NotFoundException(`Export ${jobId} belum selesai`);
    }
    const s3Key = S3StorageService.resolveS3Key(job.filePath);
    const { buffer, contentType } = await this.s3StorageService.getObjectBuffer(s3Key);
    const filename = await this.buildDownloadFilename(job, s3Key);
    return { buffer, contentType, filename };
  }

  /**
   * Susun nama file unduhan dari judul survei (bila ada) + tanggal selesai.
   * Fallback ke "audit-log" untuk export audit, atau nama generik bila judul
   * tidak ditemukan. Selalu mempertahankan ekstensi asli dari S3 key.
   */
  private async buildDownloadFilename(job: ExportJob, s3Key: string): Promise<string> {
    const ext = s3Key.includes('.') ? s3Key.split('.').pop()! : String(job.format);
    const datePart = new Date(job.completedAt ?? Date.now()).toISOString().slice(0, 10);

    const surveyId = (job.filtersApplied as Record<string, any> | undefined)?.surveyId as
      string | undefined;

    let base = 'export';
    if (surveyId) {
      try {
        const rows: Array<{ title: string }> = await this.exportJobRepository.manager.query(
          'SELECT title FROM survey WHERE id = $1 LIMIT 1',
          [surveyId],
        );
        const title = rows?.[0]?.title;
        base = title ? `Respons ${title}` : `survei-${surveyId.slice(0, 8)}`;
      } catch {
        base = `survei-${surveyId.slice(0, 8)}`;
      }
    } else {
      base = 'audit-log';
    }

    return `${safeFilePart(base)}-${datePart}.${ext}`;
  }

  /**
   * Create an export job and queue it for background processing.
   */
  private async createExportJob(
    format: ExportFormat,
    jobName: string,
    surveyId: string,
    filters: ResponseFilter,
    requestedBy: string,
  ): Promise<ExportJob> {
    const exportJob = this.exportJobRepository.create({
      requestedBy,
      format,
      status: ExportStatus.PENDING,
      filtersApplied: { surveyId, ...filters },
    });

    const savedJob = await this.exportJobRepository.save(exportJob);

    await this.exportQueue.add(
      jobName,
      {
        exportJobId: savedJob.id,
        surveyId,
        filters,
        format,
        requestedBy,
      },
      {
        attempts: EXPORT_RETRY_ATTEMPTS,
        backoff: { type: EXPORT_BACKOFF_TYPE, delay: EXPORT_RETRY_DELAY },
        removeOnComplete: true,
      },
    );

    this.logger.log(`Queued ${format} export job: ${savedJob.id} for survey ${surveyId}`);
    return savedJob;
  }
}
