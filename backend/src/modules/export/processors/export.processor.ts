import { Process, Processor } from '@nestjs/bull';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository, SelectQueryBuilder } from 'typeorm';
import { Job } from 'bull';
import * as fs from 'fs';
import * as path from 'path';
import * as ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { ExportJob } from '../entities/export-job.entity';
import { SurveyResponse } from '@modules/response/entities/survey-response.entity';
import { UserProfile } from '@modules/registration/entities/user-profile.entity';
import { Question } from '@modules/survey/entities/question.entity';
import { QuestionType } from '@shared/enums';
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

/** Bungkus satu sel CSV: kutip & escape agar koma/baris-baru di teks aman. */
function csvCell(value: unknown): string {
  const s = value == null ? '' : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

/** Ubah nilai jawaban (string/angka/array/objek) menjadi teks ringkas. */
function answerToString(value: any): string {
  if (value == null) return '';
  if (Array.isArray(value)) {
    return value
      .map((v) => (v && typeof v === 'object' ? JSON.stringify(v) : String(v)))
      .join('; ');
  }
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

/**
 * Sub-kolom untuk jawaban wilayah Indonesia bertingkat. Jawaban disimpan sebagai
 * objek { province_name, regency_name, district_name, village_name }, dipecah jadi
 * kolom terpisah supaya siap dipakai sebagai variabel pembobot saat analisis.
 */
const REGION_SUBCOLUMNS: { suffix: string; key: string }[] = [
  { suffix: 'Provinsi', key: 'province_name' },
  { suffix: 'Kab/Kota', key: 'regency_name' },
  { suffix: 'Kecamatan', key: 'district_name' },
  { suffix: 'Kelurahan/Desa', key: 'village_name' },
];

/** Ambil satu nama tingkatan wilayah dari objek jawaban indonesia_region. */
function regionName(value: any, key: string): string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return '';
  const v = (value as Record<string, unknown>)[key];
  return v == null ? '' : String(v);
}

/** Kolom demografi (variabel pembobot) yang disertakan di setiap baris export. */
const DEMOGRAPHIC_HEADERS = [
  'nama',
  'telepon',
  'usia',
  'tanggal_lahir',
  'jenis_kelamin',
  'pendidikan',
  'pekerjaan',
  'agama',
  'provinsi',
  'kota_kabupaten',
  'kecamatan',
];

@Processor(EXPORT_QUEUE)
export class ExportProcessor {
  private readonly logger = new Logger(ExportProcessor.name);

  constructor(
    @InjectRepository(ExportJob)
    private readonly exportJobRepository: Repository<ExportJob>,
    @InjectRepository(SurveyResponse)
    private readonly responseRepository: Repository<SurveyResponse>,
    @InjectRepository(UserProfile)
    private readonly userProfileRepository: Repository<UserProfile>,
    @InjectRepository(Question)
    private readonly questionRepository: Repository<Question>,
    private readonly s3StorageService: S3StorageService,
  ) {}

  @Process(EXPORT_CSV_JOB)
  async handleCsvExport(job: Job<ExportJobData>): Promise<ExportResult> {
    return this.processExport(job, async (responses, profiles, questions) => {
      return this.generateCsv(responses, profiles, questions);
    }, 'csv');
  }

  @Process(EXPORT_EXCEL_JOB)
  async handleExcelExport(job: Job<ExportJobData>): Promise<ExportResult> {
    return this.processExport(job, async (responses, profiles, questions) => {
      return this.generateExcel(responses, profiles, questions);
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
    return this.processExport(job, async (responses, profiles, questions) => {
      return this.generateJson(responses, profiles, questions);
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
    generateContent: (
      responses: SurveyResponse[],
      profiles: Map<string, UserProfile>,
      questions: Question[],
    ) => Promise<string | Buffer>,
    extension: string,
  ): Promise<ExportResult> {
    const { exportJobId, surveyId, filters } = job.data;
    this.logger.log(`Processing ${extension} export job ${exportJobId} for survey ${surveyId}`);

    try {
      await this.updateJobStatus(exportJobId, ExportStatus.PROCESSING);

      // Fetch responses with filters applied
      const responses = await this.fetchFilteredResponses(surveyId!, filters);

      // Muat demografi responden (pembobot) + daftar pertanyaan utk kolom analisis.
      const [profiles, questions] = await Promise.all([
        this.loadProfiles(responses),
        this.loadQuestions(surveyId!),
      ]);

      // Generate file content
      const content = await generateContent(responses, profiles, questions);

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

  /** Peta userId → profil demografi untuk responden pada kumpulan respons ini. */
  private async loadProfiles(
    responses: SurveyResponse[],
  ): Promise<Map<string, UserProfile>> {
    const ids = [...new Set(responses.map((r) => r.respondentId).filter(Boolean))];
    if (ids.length === 0) return new Map();
    const profiles = await this.userProfileRepository.find({
      where: { userId: In(ids) },
    });
    return new Map(profiles.map((p) => [p.userId, p]));
  }

  /** Pertanyaan aktif survei (urut) — jadi kolom per-pertanyaan di file analisis. */
  private async loadQuestions(surveyId: string): Promise<Question[]> {
    return this.questionRepository.find({
      where: { surveyId, enabled: true },
      order: { orderIndex: 'ASC' },
    });
  }

  /**
   * Bentuk tabel datar siap-analisis: satu baris per respons, kolom = metadata +
   * demografi (pembobot) + satu kolom tiap pertanyaan. Header & baris (string[][]).
   */
  private buildAnalysisTable(
    responses: SurveyResponse[],
    profiles: Map<string, UserProfile>,
    questions: Question[],
  ): { headers: string[]; rows: string[][] } {
    const metaHeaders = [
      'response_id',
      'status',
      'mulai_pengisian',
      'waktu_kirim',
      'perangkat',
    ];

    // Satu kolom per pertanyaan, KECUALI pertanyaan wilayah Indonesia yang
    // dipecah menjadi beberapa kolom (Provinsi, Kab/Kota, Kecamatan, Kelurahan).
    type QColumn = { header: string; questionId: string; extract: (value: any) => string };
    const questionColumns: QColumn[] = [];
    questions.forEach((q, i) => {
      const base = q.questionText?.trim() || `Pertanyaan ${i + 1}`;
      if (q.type === QuestionType.INDONESIA_REGION) {
        REGION_SUBCOLUMNS.forEach((sub) => {
          questionColumns.push({
            header: `${base} - ${sub.suffix}`,
            questionId: q.id,
            extract: (value) => regionName(value, sub.key),
          });
        });
      } else {
        questionColumns.push({ header: base, questionId: q.id, extract: answerToString });
      }
    });

    const headers = [
      ...metaHeaders,
      ...DEMOGRAPHIC_HEADERS,
      ...questionColumns.map((c) => c.header),
    ];

    const rows = responses.map((r) => {
      const p = profiles.get(r.respondentId);
      const answerByQ = new Map(
        (r.answers ?? []).map((a) => [a.questionId, a.value]),
      );
      return [
        r.id,
        r.status,
        r.startedAt ? r.startedAt.toISOString() : '',
        r.submittedAt ? r.submittedAt.toISOString() : '',
        r.deviceType ?? '',
        // Demografi (pembobot)
        r.respondent?.fullName ?? '',
        r.respondent?.phone ?? '',
        p?.age != null ? String(p.age) : '',
        p?.dateOfBirth ?? '',
        p?.gender ?? '',
        p?.education ?? '',
        p?.occupation ?? '',
        p?.religion ?? '',
        p?.province ?? '',
        p?.city ?? '',
        p?.district ?? '',
        // Jawaban per pertanyaan (wilayah sudah dipecah jadi beberapa kolom)
        ...questionColumns.map((c) => c.extract(answerByQ.get(c.questionId))),
      ];
    });

    return { headers, rows };
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

  private generateCsv(
    responses: SurveyResponse[],
    profiles: Map<string, UserProfile>,
    questions: Question[],
  ): Promise<string> {
    const { headers, rows } = this.buildAnalysisTable(responses, profiles, questions);
    const lines = [
      headers.map(csvCell).join(','),
      ...rows.map((row) => row.map(csvCell).join(',')),
    ];
    return Promise.resolve(lines.join('\n'));
  }

  private async generateExcel(
    responses: SurveyResponse[],
    profiles: Map<string, UserProfile>,
    questions: Question[],
  ): Promise<Buffer> {
    const total = responses.length;
    const complete = responses.filter((r) => r.status === 'complete').length;
    const inProgress = responses.filter((r) => r.status === 'in_progress').length;

    const workbook = new ExcelJS.Workbook();

    // Sheet "Ringkasan"
    const summary = workbook.addWorksheet('Ringkasan');
    summary.addRow(['Metrik', 'Nilai']);
    summary.addRow(['Total respons', total]);
    summary.addRow(['Selesai', complete]);
    summary.addRow(['Sedang mengisi', inProgress]);
    summary.addRow([
      'Tingkat penyelesaian',
      total > 0 ? `${((complete / total) * 100).toFixed(1)}%` : '0%',
    ]);
    summary.getRow(1).font = { bold: true };

    // Sheet "Data" — tabel datar siap-analisis (demografi + per pertanyaan)
    const data = workbook.addWorksheet('Data');
    const { headers, rows } = this.buildAnalysisTable(responses, profiles, questions);
    data.addRow(headers);
    rows.forEach((row) => data.addRow(row));
    data.getRow(1).font = { bold: true };
    if (data.columns) {
      data.columns.forEach((col) => {
        col.width = 22;
      });
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return Buffer.from(buffer as ArrayBuffer);
  }

  private generatePdf(responses: SurveyResponse[]): Promise<Buffer> {
    const total = responses.length;
    const complete = responses.filter((r) => r.status === 'complete').length;

    return new Promise<Buffer>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 40, size: 'A4' });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.fontSize(16).text('Laporan Respons Survei', { underline: true });
      doc.moveDown();
      doc.fontSize(11);
      doc.text(`Total respons: ${total}`);
      doc.text(`Selesai: ${complete}`);
      doc.text(
        `Tingkat penyelesaian: ${total > 0 ? ((complete / total) * 100).toFixed(1) : 0}%`,
      );
      doc.text(`Dibuat: ${new Date().toLocaleString('id-ID')}`);
      doc.moveDown();

      doc.fontSize(12).text('Daftar Respons', { underline: true });
      doc.moveDown(0.5);
      doc.fontSize(9);
      responses.slice(0, 2000).forEach((r, i) => {
        const name = r.respondent?.fullName ?? '-';
        const when = r.submittedAt?.toISOString() ?? r.startedAt?.toISOString() ?? '-';
        doc.text(`${i + 1}. ${name} — ${r.status} — ${when}`);
      });

      doc.end();
    });
  }

  private generateJson(
    responses: SurveyResponse[],
    profiles: Map<string, UserProfile>,
    _questions: Question[],
  ): Promise<string> {
    const structured = {
      exportedAt: new Date().toISOString(),
      totalResponses: responses.length,
      responses: responses.map((r) => {
        const p = profiles.get(r.respondentId);
        return {
          id: r.id,
          surveyId: r.surveyId,
          respondentId: r.respondentId,
          status: r.status,
          deviceType: r.deviceType,
          startedAt: r.startedAt?.toISOString() || null,
          submittedAt: r.submittedAt?.toISOString() || null,
          // Demografi responden (variabel pembobot) ikut dalam file yang sama.
          respondent: {
            fullName: r.respondent?.fullName ?? null,
            phone: r.respondent?.phone ?? null,
            age: p?.age ?? null,
            dateOfBirth: p?.dateOfBirth ?? null,
            gender: p?.gender ?? null,
            education: p?.education ?? null,
            occupation: p?.occupation ?? null,
            religion: p?.religion ?? null,
            province: p?.province ?? null,
            city: p?.city ?? null,
            district: p?.district ?? null,
          },
          answers: r.answers?.map((a) => ({
            questionId: a.questionId,
            value: a.value,
          })) || [],
        };
      }),
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
    content: string | Buffer,
    extension: string,
  ): Promise<string> {
    const exportDir = path.resolve(process.cwd(), EXPORTS_DIRECTORY);

    if (!fs.existsSync(exportDir)) {
      fs.mkdirSync(exportDir, { recursive: true });
    }

    const fileName = `export-${jobId}.${extension}`;
    const localFilePath = path.join(exportDir, fileName);

    // Tulis file sementara: string → utf-8, Buffer (xlsx/pdf) → biner apa adanya.
    fs.writeFileSync(localFilePath, content);
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
