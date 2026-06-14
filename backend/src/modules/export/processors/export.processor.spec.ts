import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ExportProcessor } from './export.processor';
import { S3StorageService } from '../s3-storage.service';
import { ExportJob } from '../entities/export-job.entity';
import { SurveyResponse } from '@modules/response/entities/survey-response.entity';
import { UserProfile } from '@modules/registration/entities/user-profile.entity';
import { Question } from '@modules/survey/entities/question.entity';
import { ExportFormat, ExportStatus } from '../interfaces';
import * as fs from 'fs';
import * as path from 'path';

// Mock fs: hanya override tulis-file; sisanya pakai fs asli agar pdfkit tetap
// bisa membaca berkas font (readFileSync) saat membuat PDF di test.
vi.mock('fs', async (importActual) => {
  const actual = await importActual<typeof import('fs')>();
  return {
    ...actual,
    default: actual,
    existsSync: vi.fn().mockReturnValue(true),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
});

describe('ExportProcessor', () => {
  let processor: ExportProcessor;
  let mockExportJobRepository: any;
  let mockResponseRepository: any;
  let mockUserProfileRepository: any;
  let mockQuestionRepository: any;
  let mockS3StorageService: any;

  const mockResponses: Partial<SurveyResponse>[] = [
    {
      id: 'resp-1',
      surveyId: 'survey-1',
      respondentId: 'user-1',
      status: 'complete' as any,
      deviceType: 'mobile',
      startedAt: new Date('2024-01-15T10:00:00Z'),
      submittedAt: new Date('2024-01-15T10:30:00Z'),
      exportedAt: null,
      answers: [
        { id: 'a-1', responseId: 'resp-1', questionId: 'q-1', value: 'Answer 1', answeredAt: new Date() } as any,
      ],
      respondent: { id: 'user-1', fullName: 'John Doe', phone: '08123456789' } as any,
    },
    {
      id: 'resp-2',
      surveyId: 'survey-1',
      respondentId: 'user-2',
      status: 'complete' as any,
      deviceType: 'desktop',
      startedAt: new Date('2024-01-16T09:00:00Z'),
      submittedAt: new Date('2024-01-16T09:45:00Z'),
      exportedAt: null,
      answers: [
        { id: 'a-2', responseId: 'resp-2', questionId: 'q-1', value: 'Answer 2', answeredAt: new Date() } as any,
      ],
      respondent: { id: 'user-2', fullName: 'Jane Smith', phone: '08198765432' } as any,
    },
  ];

  beforeEach(async () => {
    const mockQueryBuilder = {
      leftJoinAndSelect: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      whereInIds: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue({ affected: 2 }),
      getMany: vi.fn().mockResolvedValue(mockResponses),
    };

    mockExportJobRepository = {
      update: vi.fn().mockResolvedValue({ affected: 1 }),
    };

    mockResponseRepository = {
      createQueryBuilder: vi.fn().mockReturnValue(mockQueryBuilder),
      find: vi.fn().mockResolvedValue(mockResponses),
    };

    // Demografi + pertanyaan untuk kolom analisis (kosong di test dasar).
    mockUserProfileRepository = {
      find: vi.fn().mockResolvedValue([]),
    };
    mockQuestionRepository = {
      find: vi.fn().mockResolvedValue([]),
    };

    // The processor writes a temp file then uploads it to S3, returning the key.
    mockS3StorageService = {
      uploadFile: vi
        .fn()
        .mockImplementation((_localPath: string, s3Key: string) => Promise.resolve(s3Key)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExportProcessor,
        {
          provide: getRepositoryToken(ExportJob),
          useValue: mockExportJobRepository,
        },
        {
          provide: getRepositoryToken(SurveyResponse),
          useValue: mockResponseRepository,
        },
        {
          provide: getRepositoryToken(UserProfile),
          useValue: mockUserProfileRepository,
        },
        {
          provide: getRepositoryToken(Question),
          useValue: mockQuestionRepository,
        },
        {
          provide: S3StorageService,
          useValue: mockS3StorageService,
        },
      ],
    }).compile();

    processor = module.get<ExportProcessor>(ExportProcessor);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('handleCsvExport', () => {
    it('should process CSV export and write file', async () => {
      const job = {
        data: {
          exportJobId: 'job-1',
          surveyId: 'survey-1',
          filters: { completionStatus: 'complete' },
          format: ExportFormat.CSV,
          requestedBy: 'user-1',
        },
      } as any;

      const result = await processor.handleCsvExport(job);

      expect(result.success).toBe(true);
      expect(result.filePath).toContain('export-job-1.csv');
      expect(mockExportJobRepository.update).toHaveBeenCalledWith('job-1', { status: ExportStatus.PROCESSING });
      expect(mockExportJobRepository.update).toHaveBeenCalledWith('job-1', expect.objectContaining({
        status: ExportStatus.COMPLETED,
        filePath: expect.any(String),
        completedAt: expect.any(Date),
      }));
      expect(fs.writeFileSync).toHaveBeenCalled();
    });

    it('should apply filters to the query', async () => {
      const job = {
        data: {
          exportJobId: 'job-1',
          surveyId: 'survey-1',
          filters: {
            dateRange: { start: '2024-01-01', end: '2024-12-31' },
            region: 'Jakarta',
            completionStatus: 'complete',
            deviceType: 'mobile',
          },
          format: ExportFormat.CSV,
          requestedBy: 'user-1',
        },
      } as any;

      await processor.handleCsvExport(job);

      const qb = mockResponseRepository.createQueryBuilder();
      expect(qb.andWhere).toHaveBeenCalled();
    });

    it('should mark responses with export timestamp after export', async () => {
      const job = {
        data: {
          exportJobId: 'job-1',
          surveyId: 'survey-1',
          filters: {},
          format: ExportFormat.CSV,
          requestedBy: 'user-1',
        },
      } as any;

      await processor.handleCsvExport(job);

      // Verify that the update query was called to mark responses as exported
      const qb = mockResponseRepository.createQueryBuilder();
      expect(qb.update).toHaveBeenCalled();
      expect(qb.set).toHaveBeenCalledWith({ exportedAt: expect.any(Date) });
      expect(qb.whereInIds).toHaveBeenCalledWith(['resp-1', 'resp-2']);
    });
  });

  describe('handleExcelExport', () => {
    it('should process Excel export with summary statistics', async () => {
      const job = {
        data: {
          exportJobId: 'job-2',
          surveyId: 'survey-1',
          filters: {},
          format: ExportFormat.EXCEL,
          requestedBy: 'user-1',
        },
      } as any;

      const result = await processor.handleExcelExport(job);

      expect(result.success).toBe(true);
      expect(result.filePath).toContain('export-job-2.xlsx');

      // .xlsx asli = Buffer biner (bukan teks CSV lagi).
      const writeCall = (fs.writeFileSync as any).mock.calls[0];
      expect(Buffer.isBuffer(writeCall[1])).toBe(true);
      expect(writeCall[1].length).toBeGreaterThan(0);
    });
  });

  describe('handleJsonExport', () => {
    it('should process JSON export with structured data', async () => {
      const job = {
        data: {
          exportJobId: 'job-3',
          surveyId: 'survey-1',
          filters: {},
          format: ExportFormat.JSON,
          requestedBy: 'user-1',
        },
      } as any;

      const result = await processor.handleJsonExport(job);

      expect(result.success).toBe(true);
      expect(result.filePath).toContain('export-job-3.json');

      const writeCall = (fs.writeFileSync as any).mock.calls[0];
      const content = JSON.parse(writeCall[1]);
      expect(content.totalResponses).toBe(2);
      expect(content.responses).toHaveLength(2);
      expect(content.responses[0].answers).toHaveLength(1);
    });
  });

  describe('handlePdfExport', () => {
    it('should process PDF export with report content', async () => {
      const job = {
        data: {
          exportJobId: 'job-4',
          surveyId: 'survey-1',
          filters: {},
          format: ExportFormat.PDF,
          requestedBy: 'user-1',
        },
      } as any;

      const result = await processor.handlePdfExport(job);

      expect(result.success).toBe(true);
      expect(result.filePath).toContain('export-job-4.pdf');

      // PDF asli = Buffer biner diawali tanda "%PDF".
      const writeCall = (fs.writeFileSync as any).mock.calls[0];
      expect(Buffer.isBuffer(writeCall[1])).toBe(true);
      expect(writeCall[1].subarray(0, 4).toString()).toBe('%PDF');
    });
  });

  describe('handleManualRewardExport', () => {
    it('should export manual reward data with respondent info', async () => {
      const job = {
        data: {
          exportJobId: 'job-5',
          surveyId: 'survey-1',
          requestedBy: 'user-1',
        },
      } as any;

      const result = await processor.handleManualRewardExport(job);

      expect(result.success).toBe(true);

      const writeCall = (fs.writeFileSync as any).mock.calls[0];
      const content = writeCall[1];
      expect(content).toContain('respondent_name');
      expect(content).toContain('destination_number');
      expect(content).toContain('completion_status');
      expect(content).toContain('John Doe');
      expect(content).toContain('08123456789');
    });
  });

  describe('handleAuditLogExport', () => {
    it('should export audit log as CSV', async () => {
      const job = {
        data: {
          exportJobId: 'job-6',
          filters: { actionType: 'login', module: 'auth' },
          requestedBy: 'user-1',
        },
      } as any;

      const result = await processor.handleAuditLogExport(job);

      expect(result.success).toBe(true);

      const writeCall = (fs.writeFileSync as any).mock.calls[0];
      const content = writeCall[1];
      expect(content).toContain('id');
      expect(content).toContain('action_type');
      expect(content).toContain('module');
    });
  });

  describe('error handling', () => {
    it('should mark job as failed on error', async () => {
      mockResponseRepository.createQueryBuilder.mockImplementation(() => {
        throw new Error('Database connection failed');
      });

      const job = {
        data: {
          exportJobId: 'job-err',
          surveyId: 'survey-1',
          filters: {},
          format: ExportFormat.CSV,
          requestedBy: 'user-1',
        },
      } as any;

      await expect(processor.handleCsvExport(job)).rejects.toThrow('Database connection failed');

      expect(mockExportJobRepository.update).toHaveBeenCalledWith('job-err', expect.objectContaining({
        status: ExportStatus.FAILED,
      }));
    });
  });
});
