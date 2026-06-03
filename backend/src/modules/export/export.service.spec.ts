import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ExportService } from './export.service';
import { ExportJob } from './entities/export-job.entity';
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
} from './constants';

describe('ExportService', () => {
  let service: ExportService;
  let mockQueue: any;
  let mockExportJobRepository: any;

  const mockExportJob: Partial<ExportJob> = {
    id: 'job-123',
    requestedBy: 'user-1',
    format: ExportFormat.CSV,
    status: ExportStatus.PENDING,
    filePath: null,
    filtersApplied: null,
    createdAt: new Date(),
    completedAt: null,
  };

  beforeEach(async () => {
    mockQueue = {
      add: vi.fn().mockResolvedValue({ id: 'bull-job-1' }),
    };

    mockExportJobRepository = {
      create: vi.fn().mockImplementation((data) => ({ ...mockExportJob, ...data })),
      save: vi.fn().mockImplementation((data) => Promise.resolve({ ...mockExportJob, ...data })),
      findOne: vi.fn().mockResolvedValue(mockExportJob),
      update: vi.fn().mockResolvedValue({ affected: 1 }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExportService,
        {
          provide: getQueueToken(EXPORT_QUEUE),
          useValue: mockQueue,
        },
        {
          provide: getRepositoryToken(ExportJob),
          useValue: mockExportJobRepository,
        },
      ],
    }).compile();

    service = module.get<ExportService>(ExportService);
  });

  describe('exportCsv', () => {
    it('should create an export job and queue a CSV export', async () => {
      const surveyId = 'survey-1';
      const filters: ResponseFilter = { completionStatus: 'complete' };
      const requestedBy = 'user-1';

      const result = await service.exportCsv(surveyId, filters, requestedBy);

      expect(mockExportJobRepository.create).toHaveBeenCalledWith({
        requestedBy,
        format: ExportFormat.CSV,
        status: ExportStatus.PENDING,
        filtersApplied: { surveyId, ...filters },
      });
      expect(mockExportJobRepository.save).toHaveBeenCalled();
      expect(mockQueue.add).toHaveBeenCalledWith(
        EXPORT_CSV_JOB,
        expect.objectContaining({
          exportJobId: expect.any(String),
          surveyId,
          filters,
          format: ExportFormat.CSV,
          requestedBy,
        }),
        expect.objectContaining({
          attempts: EXPORT_RETRY_ATTEMPTS,
          backoff: { type: 'exponential', delay: EXPORT_RETRY_DELAY },
        }),
      );
      expect(result.format).toBe(ExportFormat.CSV);
    });
  });

  describe('exportExcel', () => {
    it('should create an export job and queue an Excel export', async () => {
      const surveyId = 'survey-1';
      const filters: ResponseFilter = {};
      const requestedBy = 'user-1';

      const result = await service.exportExcel(surveyId, filters, requestedBy);

      expect(mockQueue.add).toHaveBeenCalledWith(
        EXPORT_EXCEL_JOB,
        expect.objectContaining({
          surveyId,
          format: ExportFormat.EXCEL,
        }),
        expect.any(Object),
      );
      expect(result.format).toBe(ExportFormat.EXCEL);
    });
  });

  describe('exportPdf', () => {
    it('should create an export job and queue a PDF export', async () => {
      const surveyId = 'survey-1';
      const filters: ResponseFilter = { region: 'Jakarta' };
      const requestedBy = 'user-1';

      const result = await service.exportPdf(surveyId, filters, requestedBy);

      expect(mockQueue.add).toHaveBeenCalledWith(
        EXPORT_PDF_JOB,
        expect.objectContaining({
          surveyId,
          format: ExportFormat.PDF,
        }),
        expect.any(Object),
      );
      expect(result.format).toBe(ExportFormat.PDF);
    });
  });

  describe('exportJson', () => {
    it('should create an export job and queue a JSON export', async () => {
      const surveyId = 'survey-1';
      const filters: ResponseFilter = { deviceType: 'mobile' };
      const requestedBy = 'user-1';

      const result = await service.exportJson(surveyId, filters, requestedBy);

      expect(mockQueue.add).toHaveBeenCalledWith(
        EXPORT_JSON_JOB,
        expect.objectContaining({
          surveyId,
          format: ExportFormat.JSON,
        }),
        expect.any(Object),
      );
      expect(result.format).toBe(ExportFormat.JSON);
    });
  });

  describe('exportAuditLog', () => {
    it('should create an export job and queue an audit log export', async () => {
      const filters: AuditFilter = { actionType: 'login', module: 'auth' };
      const requestedBy = 'user-1';

      const result = await service.exportAuditLog(filters, requestedBy);

      expect(mockExportJobRepository.create).toHaveBeenCalledWith({
        requestedBy,
        format: ExportFormat.CSV,
        status: ExportStatus.PENDING,
        filtersApplied: filters,
      });
      expect(mockQueue.add).toHaveBeenCalledWith(
        EXPORT_AUDIT_LOG_JOB,
        expect.objectContaining({
          exportJobId: expect.any(String),
          filters,
          requestedBy,
        }),
        expect.objectContaining({
          attempts: EXPORT_RETRY_ATTEMPTS,
        }),
      );
      expect(result.format).toBe(ExportFormat.CSV);
    });
  });

  describe('extractManualRewardData', () => {
    it('should create an export job and queue a manual reward export', async () => {
      const surveyId = 'survey-1';
      const requestedBy = 'user-1';

      const result = await service.extractManualRewardData(surveyId, requestedBy);

      expect(mockExportJobRepository.create).toHaveBeenCalledWith({
        requestedBy,
        format: ExportFormat.CSV,
        status: ExportStatus.PENDING,
        filtersApplied: { surveyId, type: 'manual_reward' },
      });
      expect(mockQueue.add).toHaveBeenCalledWith(
        EXPORT_MANUAL_REWARD_JOB,
        expect.objectContaining({
          exportJobId: expect.any(String),
          surveyId,
          requestedBy,
        }),
        expect.any(Object),
      );
      expect(result.format).toBe(ExportFormat.CSV);
    });
  });

  describe('getExportStatus', () => {
    it('should return the export job status', async () => {
      const result = await service.getExportStatus('job-123');

      expect(mockExportJobRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'job-123' },
      });
      expect(result).toEqual(mockExportJob);
    });

    it('should throw NotFoundException if job not found', async () => {
      mockExportJobRepository.findOne.mockResolvedValue(null);

      await expect(service.getExportStatus('non-existent')).rejects.toThrow(
        'Export job with id non-existent not found',
      );
    });
  });

  describe('downloadExport', () => {
    it('should return file path for completed export', async () => {
      const completedJob = {
        ...mockExportJob,
        status: ExportStatus.COMPLETED,
        filePath: '/exports/export-job-123.csv',
      };
      mockExportJobRepository.findOne.mockResolvedValue(completedJob);

      const result = await service.downloadExport('job-123');

      expect(result).toEqual({
        filePath: '/exports/export-job-123.csv',
        format: ExportFormat.CSV,
      });
    });

    it('should throw NotFoundException if job not completed', async () => {
      const pendingJob = { ...mockExportJob, status: ExportStatus.PROCESSING };
      mockExportJobRepository.findOne.mockResolvedValue(pendingJob);

      await expect(service.downloadExport('job-123')).rejects.toThrow(
        'Export job job-123 is not yet completed',
      );
    });

    it('should throw NotFoundException if job not found', async () => {
      mockExportJobRepository.findOne.mockResolvedValue(null);

      await expect(service.downloadExport('non-existent')).rejects.toThrow(
        'Export job with id non-existent not found',
      );
    });

    it('should throw NotFoundException if file path is null', async () => {
      const completedJob = {
        ...mockExportJob,
        status: ExportStatus.COMPLETED,
        filePath: null,
      };
      mockExportJobRepository.findOne.mockResolvedValue(completedJob);

      await expect(service.downloadExport('job-123')).rejects.toThrow(
        'Export file not found for job job-123',
      );
    });
  });

  describe('filter application', () => {
    it('should store filters in the export job', async () => {
      const filters: ResponseFilter = {
        dateRange: { start: '2024-01-01', end: '2024-12-31' },
        region: 'Jakarta',
        completionStatus: 'complete',
        deviceType: 'mobile',
        tags: ['important'],
      };

      await service.exportCsv('survey-1', filters, 'user-1');

      expect(mockExportJobRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          filtersApplied: { surveyId: 'survey-1', ...filters },
        }),
      );
    });
  });
});
