import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SurveyTimeService } from './survey-time.service';
import { SurveyTimeConfig } from '../entities/survey-time-config.entity';
import { NotFoundException } from '@nestjs/common';

function createTimeConfig(overrides: Partial<SurveyTimeConfig> = {}): SurveyTimeConfig {
  const config = new SurveyTimeConfig();
  config.id = 'tc-1';
  config.surveyId = 'survey-1';
  config.startDatetime = null;
  config.endDatetime = null;
  config.maxDurationMinutes = null;
  config.maxRespondents = null;
  config.currentRespondentCount = 0;
  return Object.assign(config, overrides);
}

describe('SurveyTimeService', () => {
  let service: SurveyTimeService;
  let mockTimeConfigRepository: any;

  beforeEach(() => {
    mockTimeConfigRepository = {
      findOne: vi.fn(),
      save: vi.fn(),
      createQueryBuilder: vi.fn(),
    };

    service = new SurveyTimeService(mockTimeConfigRepository);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('checkSurveyAccess', () => {
    it('should throw NotFoundException if time config does not exist', async () => {
      mockTimeConfigRepository.findOne.mockResolvedValue(null);

      await expect(service.checkSurveyAccess('non-existent')).rejects.toThrow(NotFoundException);
    });

    it('should deny access if current time is before start_datetime', async () => {
      const futureDate = new Date(Date.now() + 24 * 60 * 60 * 1000); // tomorrow
      const config = createTimeConfig({ startDatetime: futureDate });
      mockTimeConfigRepository.findOne.mockResolvedValue(config);

      const result = await service.checkSurveyAccess('survey-1');

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Survey has not started yet');
    });

    it('should deny access if current time is after end_datetime', async () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000); // yesterday
      const config = createTimeConfig({
        startDatetime: new Date(Date.now() - 48 * 60 * 60 * 1000),
        endDatetime: pastDate,
      });
      mockTimeConfigRepository.findOne.mockResolvedValue(config);

      const result = await service.checkSurveyAccess('survey-1');

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Survey has ended');
    });

    it('should deny access if max respondents reached', async () => {
      const config = createTimeConfig({
        startDatetime: new Date(Date.now() - 24 * 60 * 60 * 1000),
        endDatetime: new Date(Date.now() + 24 * 60 * 60 * 1000),
        maxRespondents: 100,
        currentRespondentCount: 100,
      });
      mockTimeConfigRepository.findOne.mockResolvedValue(config);

      const result = await service.checkSurveyAccess('survey-1');

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Maximum number of respondents reached');
    });

    it('should allow access when within valid time range and under respondent cap', async () => {
      const config = createTimeConfig({
        startDatetime: new Date(Date.now() - 24 * 60 * 60 * 1000),
        endDatetime: new Date(Date.now() + 24 * 60 * 60 * 1000),
        maxRespondents: 100,
        currentRespondentCount: 50,
      });
      mockTimeConfigRepository.findOne.mockResolvedValue(config);

      const result = await service.checkSurveyAccess('survey-1');

      expect(result.allowed).toBe(true);
      expect(result.reason).toBeUndefined();
    });

    it('should allow access when no time constraints are configured', async () => {
      const config = createTimeConfig();
      mockTimeConfigRepository.findOne.mockResolvedValue(config);

      const result = await service.checkSurveyAccess('survey-1');

      expect(result.allowed).toBe(true);
    });
  });

  describe('checkSubmissionAllowed', () => {
    it('should deny submission if current time is after end_datetime', async () => {
      const pastDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const config = createTimeConfig({ endDatetime: pastDate });
      mockTimeConfigRepository.findOne.mockResolvedValue(config);

      const result = await service.checkSubmissionAllowed('survey-1');

      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('submissions are no longer accepted');
    });

    it('should deny submission if max respondents reached', async () => {
      const config = createTimeConfig({
        maxRespondents: 50,
        currentRespondentCount: 50,
      });
      mockTimeConfigRepository.findOne.mockResolvedValue(config);

      const result = await service.checkSubmissionAllowed('survey-1');

      expect(result.allowed).toBe(false);
      expect(result.reason).toBe('Maximum number of respondents reached');
    });

    it('should allow submission when within valid constraints', async () => {
      const config = createTimeConfig({
        endDatetime: new Date(Date.now() + 24 * 60 * 60 * 1000),
        maxRespondents: 100,
        currentRespondentCount: 30,
      });
      mockTimeConfigRepository.findOne.mockResolvedValue(config);

      const result = await service.checkSubmissionAllowed('survey-1');

      expect(result.allowed).toBe(true);
    });
  });

  describe('incrementRespondentCount', () => {
    const makeQueryBuilder = (affected: number) => {
      const qb: any = {
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue({ affected }),
      };
      return qb;
    };

    it('should atomically increment via a single UPDATE statement', async () => {
      const qb = makeQueryBuilder(1);
      mockTimeConfigRepository.createQueryBuilder.mockReturnValue(qb);

      await service.incrementRespondentCount('survey-1');

      expect(qb.set).toHaveBeenCalledWith({
        currentRespondentCount: expect.any(Function),
      });
      expect(qb.where).toHaveBeenCalledWith('survey_id = :surveyId', {
        surveyId: 'survey-1',
      });
      expect(qb.execute).toHaveBeenCalled();
    });

    it('should throw NotFoundException if time config does not exist', async () => {
      const qb = makeQueryBuilder(0);
      mockTimeConfigRepository.createQueryBuilder.mockReturnValue(qb);

      await expect(service.incrementRespondentCount('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('getRemainingTime', () => {
    it('should return null if maxDurationMinutes is null', () => {
      const startedAt = new Date(Date.now() - 5 * 60 * 1000);
      const result = service.getRemainingTime(null, startedAt);
      expect(result).toBeNull();
    });

    it('should return remaining seconds when timer has not expired', () => {
      const startedAt = new Date(Date.now() - 5 * 60 * 1000); // started 5 min ago
      const result = service.getRemainingTime(30, startedAt); // 30 min max

      // Should be approximately 25 minutes = 1500 seconds
      expect(result).toBeGreaterThan(1490);
      expect(result).toBeLessThanOrEqual(1500);
    });

    it('should return 0 when timer has expired', () => {
      const startedAt = new Date(Date.now() - 60 * 60 * 1000); // started 60 min ago
      const result = service.getRemainingTime(30, startedAt); // 30 min max

      expect(result).toBe(0);
    });

    it('should return full duration when just started', () => {
      const startedAt = new Date(); // just now
      const result = service.getRemainingTime(10, startedAt); // 10 min max

      // Should be approximately 600 seconds
      expect(result).toBeGreaterThanOrEqual(599);
      expect(result).toBeLessThanOrEqual(600);
    });
  });

  describe('isTimerExpired', () => {
    it('should return false if maxDurationMinutes is null', () => {
      const startedAt = new Date(Date.now() - 60 * 60 * 1000);
      const result = service.isTimerExpired(null, startedAt);
      expect(result).toBe(false);
    });

    it('should return false when timer has not expired', () => {
      const startedAt = new Date(Date.now() - 5 * 60 * 1000); // 5 min ago
      const result = service.isTimerExpired(30, startedAt); // 30 min max
      expect(result).toBe(false);
    });

    it('should return true when timer has expired', () => {
      const startedAt = new Date(Date.now() - 60 * 60 * 1000); // 60 min ago
      const result = service.isTimerExpired(30, startedAt); // 30 min max
      expect(result).toBe(true);
    });

    it('should return true when exactly at the boundary', () => {
      const startedAt = new Date(Date.now() - 30 * 60 * 1000); // exactly 30 min ago
      const result = service.isTimerExpired(30, startedAt); // 30 min max
      expect(result).toBe(true);
    });

    it('should tolerate a small overrun within the grace window', () => {
      // 10 dtk lewat batas 30 mnt, tapi grace 15 dtk → belum dianggap kedaluwarsa
      const startedAt = new Date(Date.now() - (30 * 60 + 10) * 1000);
      expect(service.isTimerExpired(30, startedAt, 15)).toBe(false);
      // Tanpa grace, overrun sekecil apa pun sudah kedaluwarsa.
      expect(service.isTimerExpired(30, startedAt)).toBe(true);
    });
  });
});
