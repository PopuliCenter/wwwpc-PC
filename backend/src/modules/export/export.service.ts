import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bull';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Queue } from 'bull';
import { v4 as uuidv4 } from 'uuid';
import { ExportJob } from './entities/export-job.entity';
import { S3StorageService } from './s3-storage.service';
import {
  ExportFormat,
  ExportStatus,
  ResponseFilter,
  AuditFilter,
} from './interfaces';
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
    return this.createExportJob(
      ExportFormat.CSV,
      EXPORT_CSV_JOB,
      surveyId,
      filters,
      requestedBy,
    );
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
    return this.createExportJob(
      ExportFormat.PDF,
      EXPORT_PDF_JOB,
      surveyId,
      filters,
      requestedBy,
    );
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
    return this.createExportJob(
      ExportFormat.JSON,
      EXPORT_JSON_JOB,
      surveyId,
      filters,
      requestedBy,
    );
  }

  /**
   * Export audit log entries as CSV.
   * Runs as a background job via BullMQ.
   */
  async exportAuditLog(
    filters: AuditFilter,
    requestedBy: string,
  ): Promise<ExportJob> {
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
  async extractManualRewardData(
    surveyId: string,
    requestedBy: string,
  ): Promise<ExportJob> {
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
  async getExportStatus(jobId: string): Promise<ExportJob> {
    const job = await this.exportJobRepository.findOne({
      where: { id: jobId },
    });

    if (!job) {
      throw new NotFoundException(`Export job with id ${jobId} not found`);
    }

    return job;
  }

  /**
   * Generate a time-limited pre-signed download URL for a completed export job.
   * The caller receives a URL that expires (default 15 min) — the S3 object
   * itself remains private and is never publicly accessible.
   */
  async downloadExport(jobId: string): Promise<{ presignedUrl: string; format: ExportFormat }> {
    const job = await this.exportJobRepository.findOne({
      where: { id: jobId },
    });

    if (!job) {
      throw new NotFoundException(`Export job with id ${jobId} not found`);
    }

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
   */
  async getExportFile(
    jobId: string,
  ): Promise<{ buffer: Buffer; contentType: string; filename: string }> {
    const job = await this.exportJobRepository.findOne({ where: { id: jobId } });
    if (!job) {
      throw new NotFoundException(`Export job with id ${jobId} not found`);
    }
    if (job.status !== ExportStatus.COMPLETED || !job.filePath) {
      throw new NotFoundException(`Export ${jobId} belum selesai`);
    }
    const s3Key = S3StorageService.resolveS3Key(job.filePath);
    const { buffer, contentType } = await this.s3StorageService.getObjectBuffer(s3Key);
    const filename = s3Key.split('/').pop() ?? `export-${jobId}.${job.format}`;
    return { buffer, contentType, filename };
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
