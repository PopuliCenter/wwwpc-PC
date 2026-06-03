import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Job } from 'bull';
import * as fs from 'fs';
import * as path from 'path';
import { ExportJob } from '../entities/export-job.entity';
import { SurveyResponse } from '@modules/response/entities/survey-response.entity';
import { S3StorageService } from '../s3-storage.service';
import {
  ExportStatus,
  ExportJobData,
  AuditExportJobData,
  ManualRewardExportJobData,
  ExportResult,
  ResponseFilter,
} from '../interfaces';
import {
  EXPORT_QUEUE,
  EXPORT_CSV_JOB,
  EXPORT_EXCEL_JOB,
  EXPORT_PDF_JOB,
  EXPORT_JSON_JOB,
  EXPORT_AUDIT_LOG_JOB,
  EXPORT_MANUAL_REWARD_JOB,
  EXPORTS_DIRECTORY,
} from '../constants';

@Processor(EXPORT_QUEUE)
export class ExportProcessor {
  private readonly logger = new Logger(ExportProcessor.name);

  constructor(
    @InjectRepository(ExportJob)
    private readonly exportJobRepository: Repository<ExportJob>,
    @InjectRepository(SurveyResponse)
    private readonly responseRepository: Repository<SurveyResponse>,
    private readonly s3StorageService: S3StorageService,
  ) {}

  @Process(EXPORT_CSV_JOB)
  async handleCsvExport(job: Job<ExportJobData>): Promise<ExportResult> {
    return this.processExport(job, async (responses) => {
      return this.generateCsv(responses);
    }, 'csv');
  }

  @Process(EXPORT_EXCEL_JOB)
  async handleExcelExport(job: Job<ExportJobData>): Promise<ExportResult> {
    return this.processExport(job, async (responses) => {
      return this.generateExcel(responses);
    }, 'xlsx');
  }

  @Process(EXPORT_PDF_JOB)
  async handlePdfExport(job: Job<ExportJobData>): Promise<ExportResult> {
    return this.processExport(job, async (responses) => {
      return this.generatePdf(responses);
    }, 'pdf');
  }

  @Process(EXPORT_JSON_JOB)
  async handleJsonExport(job: Job<ExportJobData>): Promise<ExportResult> {
    return this.processExport(job, async (responses) => {
      return this.generateJson(responses);
    }, 'json');
  }

  @Process(EXPORT_AUDIT_LOG_JOB)
  async handleAuditLogExport(job: Job<AuditExportJobData>): Promise<ExportResult> {
    const { exportJobId, filters } = job.data;
    this.logger.log(`Processing audit log export job ${exportJobId}`);

    try {
      await this.updateJobStatus(exportJobId, ExportStatus.PROCESSING);

      // Generate audit log CSV content (placeholder - actual audit log query)
      const csvContent = this.generateAuditLogCsv(filters);
      const s3Key = await this.writeExportFile(exportJobId, csvContent, 'csv');

      await this.completeJob(exportJobId, s3Key);
      return { success: true, filePath: s3Key };
    } catch (error: any) {
      await this.failJob(exportJobId, error.message);
      throw error;
    }
  }

  @Process(EXPORT_MANUAL_REWARD_JOB)
  async handleManualRewardExport(job: Job<ManualRewardExportJobData>): Promise<ExportResult> {
    const { exportJobId, surveyId } = job.data;
    this.logger.log(`Processing manual reward export job ${exportJobId} for survey ${surveyId}`);

    try {
      await this.updateJobStatus(exportJobId, ExportStatus.PROCESSING);

      // Get complete responses for the survey
      const responses = await this.responseRepository.find({
        where: { surveyId, status: 'complete' as any },
        relations: ['respondent'],
      });

      const csvContent = this.generateManualRewardCsv(responses);
      const s3Key = await this.writeExportFile(exportJobId, csvContent, 'csv');

      await this.completeJob(exportJobId, s3Key);
      return { success: true, filePath: s3Key };
    } catch (error: any) {
      await this.failJob(exportJobId, error.message);
      throw error;
    }
  }

  // --- Private helpers ---

  private async processExport(
    job: Job<ExportJobData>,
    generateContent: (responses: SurveyResponse[]) => Promise<string>,
    extension: string,
  ): Promise<ExportResult> {
    const { exportJobId, surveyId, filters } = job.data;
    this.logger.log(`Processing ${extension} export job ${exportJobId} for survey ${surveyId}`);

    try {
      await this.updateJobStatus(exportJobId, ExportStatus.PROCESSING);

      // Fetch responses with filters applied
      const responses = await this.fetchFilteredResponses(surveyId!, filters);

      // Generate file content
      const content = await generateContent(responses);

      // Write temp file → upload to S3 → delete temp file; returns S3 key
      const s3Key = await this.writeExportFile(exportJobId, content, extension);

      // Mark responses with export timestamp
      await this.markResponsesExported(responses);

      await this.completeJob(exportJobId, s3Key);
      return { success: true, filePath: s3Key };
    } catch (error: any) {
      await this.failJob(exportJobId, error.message);
      throw error;
    }
  }

  private async fetchFilteredResponses(
    surveyId: string,
    filters?: ResponseFilter,
  ): Promise<SurveyResponse[]> {
    const qb = this.responseRepository
      .createQueryBuilder('response')
      .leftJoinAndSelect('response.answers', 'answers')
      .leftJoinAndSelect('response.respondent', 'respondent')
      .leftJoin('user_profile', 'profile', 'profile.user_id = respondent.id')
      .where('response.survey_id = :surveyId', { surveyId });

    if (filters) {
      this.applyFilters(qb, filters);
    }

    qb.orderBy('response.startedAt', 'ASC');
    return qb.getMany();
  }

  private applyFilters(
    qb: SelectQueryBuilder<SurveyResponse>,
    filters: ResponseFilter,
  ): void {
    if (filters.dateRange) {
      qb.andWhere('response.started_at >= :startDate', {
        startDate: new Date(filters.dateRange.start),
      });
      qb.andWhere('response.started_at <= :endDate', {
        endDate: new Date(filters.dateRange.end),
      });
    }

    if (filters.region) {
      qb.andWhere(
        '(profile.city ILIKE :region OR profile.province ILIKE :region)',
        { region: `%${filters.region}%` },
      );
    }

    if (filters.profileAttributes) {
      if (filters.profileAttributes.age) {
        qb.andWhere('profile.age = :age', { age: filters.profileAttributes.age });
      }
      if (filters.profileAttributes.gender) {
        qb.andWhere('profile.gender = :gender', {
          gender: filters.profileAttributes.gender,
        });
      }
      if (filters.profileAttributes.occupation) {
        qb.andWhere('profile.occupation ILIKE :occupation', {
          occupation: `%${filters.profileAttributes.occupation}%`,
        });
      }
    }

    if (filters.completionStatus) {
      qb.andWhere('response.status = :status', {
        status: filters.completionStatus,
      });
    }

    if (filters.deviceType) {
      qb.andWhere('response.device_type = :deviceType', {
        deviceType: filters.deviceType,
      });
    }

    if (filters.tags && filters.tags.length > 0) {
      qb.andWhere('response.tags @> :tags', {
        tags: JSON.stringify(filters.tags),
      });
    }
  }

  private async markResponsesExported(responses: SurveyResponse[]): Promise<void> {
    if (responses.length === 0) return;

    const ids = responses.map((r) => r.id);
    const now = new Date();

    await this.responseRepository
      .createQueryBuilder()
      .update(SurveyResponse)
      .set({ exportedAt: now })
      .whereInIds(ids)
      .execute();
  }

  private generateCsv(responses: SurveyResponse[]): Promise<string> {
    const headers = ['id', 'survey_id', 'respondent_id', 'status', 'device_type', 'started_at', 'submitted_at', 'answers'];
    const rows = responses.map((r) => {
      const answersJson = r.answers
        ? JSON.stringify(r.answers.map((a) => ({ questionId: a.questionId, value: a.value })))
        : '';
      return [
        r.id,
        r.surveyId,
        r.respondentId,
        r.status,
        r.deviceType || '',
        r.startedAt?.toISOString() || '',
        r.submittedAt?.toISOString() || '',
        `"${answersJson.replace(/"/g, '""')}"`,
      ].join(',');
    });

    return Promise.resolve([headers.join(','), ...rows].join('\n'));
  }

  private generateExcel(responses: SurveyResponse[]): Promise<string> {
    // Generate CSV format with summary statistics as a placeholder for Excel
    // In production, use exceljs library for proper .xlsx generation
    const totalResponses = responses.length;
    const completeResponses = responses.filter((r) => r.status === 'complete').length;
    const inProgressResponses = responses.filter((r) => r.status === 'in_progress').length;

    const summaryHeaders = ['Metric', 'Value'];
    const summaryRows = [
      ['Total Responses', String(totalResponses)],
      ['Complete', String(completeResponses)],
      ['In Progress', String(inProgressResponses)],
      ['Completion Rate', totalResponses > 0 ? `${((completeResponses / totalResponses) * 100).toFixed(1)}%` : '0%'],
    ];

    const dataHeaders = ['id', 'survey_id', 'respondent_id', 'status', 'device_type', 'started_at', 'submitted_at'];
    const dataRows = responses.map((r) => [
      r.id,
      r.surveyId,
      r.respondentId,
      r.status,
      r.deviceType || '',
      r.startedAt?.toISOString() || '',
      r.submittedAt?.toISOString() || '',
    ].join(','));

    const content = [
      '--- SUMMARY ---',
      summaryHeaders.join(','),
      ...summaryRows.map((row) => row.join(',')),
      '',
      '--- DATA ---',
      dataHeaders.join(','),
      ...dataRows,
    ].join('\n');

    return Promise.resolve(content);
  }

  private generatePdf(responses: SurveyResponse[]): Promise<string> {
    // Placeholder for PDF generation - in production use pdfkit or puppeteer
    const totalResponses = responses.length;
    const completeResponses = responses.filter((r) => r.status === 'complete').length;

    const content = [
      'SURVEY RESPONSE REPORT',
      '======================',
      '',
      `Total Responses: ${totalResponses}`,
      `Complete: ${completeResponses}`,
      `Completion Rate: ${totalResponses > 0 ? ((completeResponses / totalResponses) * 100).toFixed(1) : 0}%`,
      '',
      'Response Details:',
      '-----------------',
      ...responses.map((r) =>
        `ID: ${r.id} | Status: ${r.status} | Submitted: ${r.submittedAt?.toISOString() || 'N/A'}`,
      ),
    ].join('\n');

    return Promise.resolve(content);
  }

  private generateJson(responses: SurveyResponse[]): Promise<string> {
    const structured = {
      exportedAt: new Date().toISOString(),
      totalResponses: responses.length,
      responses: responses.map((r) => ({
        id: r.id,
        surveyId: r.surveyId,
        respondentId: r.respondentId,
        status: r.status,
        deviceType: r.deviceType,
        startedAt: r.startedAt?.toISOString() || null,
        submittedAt: r.submittedAt?.toISOString() || null,
        answers: r.answers?.map((a) => ({
          questionId: a.questionId,
          value: a.value,
        })) || [],
      })),
    };

    return Promise.resolve(JSON.stringify(structured, null, 2));
  }

  private generateAuditLogCsv(filters: any): string {
    // Placeholder - in production, query audit_log table with filters
    const headers = ['id', 'user_id', 'action_type', 'module', 'ip_address', 'created_at', 'details'];
    return headers.join(',') + '\n';
  }

  private generateManualRewardCsv(responses: SurveyResponse[]): string {
    const headers = ['respondent_name', 'destination_number', 'completion_status', 'submitted_at'];
    const rows = responses.map((r) => {
      const name = r.respondent?.fullName || '';
      const phone = r.respondent?.phone || '';
      return [
        `"${name.replace(/"/g, '""')}"`,
        phone,
        r.status,
        r.submittedAt?.toISOString() || '',
      ].join(',');
    });

    return [headers.join(','), ...rows].join('\n');
  }

  /**
   * Write content to a temp file, upload to S3 (private), delete the temp file,
   * and return the S3 object key that is stored in export_job.file_path.
   */
  private async writeExportFile(
    jobId: string,
    content: string,
    extension: string,
  ): Promise<string> {
    const exportDir = path.resolve(process.cwd(), EXPORTS_DIRECTORY);

    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }

    const fileName = `export-${jobId}.${extension}`;
    const localFilePath = path.join(exportDir, fileName);

    // Write temp file
    fs.writeFileSync(localFilePath, content, 'utf-8');
    this.logger.debug(`Temp export file written: ${localFilePath}`);

    // Upload to S3 and remove local file; uploadFile() handles the unlinkSync
    const s3Key = `exports/${fileName}`;
    const contentType = S3StorageService.contentTypeFor(extension);
    await this.s3StorageService.uploadFile(localFilePath, s3Key, contentType);

    return s3Key;
  }

  private async updateJobStatus(jobId: string, status: ExportStatus): Promise<void> {
    await this.exportJobRepository.update(jobId, { status });
  }

  private async completeJob(jobId: string, filePath: string): Promise<void> {
    await this.exportJobRepository.update(jobId, {
      status: ExportStatus.COMPLETED,
      filePath,
      completedAt: new Date(),
    });
  }

  private async failJob(jobId: string, error: string): Promise<void> {
    this.logger.error(`Export job ${jobId} failed: ${error}`);
    await this.exportJobRepository.update(jobId, {
      status: ExportStatus.FAILED,
      completedAt: new Date(),
    });
  }
}
