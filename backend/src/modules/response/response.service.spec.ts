import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { ResponseService } from './response.service';
import { SurveyResponse, ResponseStatus } from './entities/survey-response.entity';
import { Answer } from './entities/answer.entity';
import { ManualRewardDistribution, ManualRewardStatus } from './entities/manual-reward-distribution.entity';
import { SurveyTimeService } from '@modules/survey/services/survey-time.service';
import { AnswerValidationService } from '@modules/survey/services/answer-validation.service';
import { EventType } from '@modules/events/event-types';

describe('ResponseService', () => {
  let service: ResponseService;
  let responseRepository: any;
  let answerRepository: any;
  let manualRewardRepository: any;
  let surveyTimeService: any;
  let dataSource: any;
  let manager: any;
  let eventEmitter: any;

  const mockResponseRepository = {
    findOne: vi.fn(),
    find: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
    createQueryBuilder: vi.fn(),
    // assertEligible() membaca survey targeting + profil via raw query.
    manager: { query: vi.fn().mockResolvedValue([]) },
  };

  const mockAnswerRepository = {
    findOne: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
  };

  const mockManualRewardRepository = {
    findOne: vi.fn(),
    find: vi.fn(),
    create: vi.fn(),
    save: vi.fn(),
  };

  const mockSurveyTimeService = {
    checkSubmissionAllowed: vi.fn(),
    getTimeConfig: vi.fn(),
    isTimerExpired: vi.fn(),
    incrementRespondentCount: vi.fn(),
    decrementRespondentCount: vi.fn(),
  };

  const mockAnswerValidationService = {
    validate: vi.fn().mockResolvedValue(undefined),
  };

  // Transaction EntityManager mock
  const mockManager = {
    create: vi.fn(),
    save: vi.fn(),
    query: vi.fn(),
    delete: vi.fn(),
  };

  const mockDataSource = {
    // Run the callback with the mocked manager, just like a real transaction
    transaction: vi.fn(async (cb: any) => cb(mockManager)),
    manager: mockManager,
    // Used by emitResponseSubmitted to fetch respondent/survey metadata
    query: vi.fn(),
  };

  const mockEventEmitter = {
    emit: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    // Sensible defaults for the transaction manager
    mockManager.create.mockImplementation((entity: any, data: any) =>
      entity === SurveyResponse ? { id: 'resp-new', ...data } : data,
    );
    mockManager.save.mockImplementation((e: any) => Promise.resolve(e));
    mockManager.query.mockResolvedValue(undefined);
    mockDataSource.transaction.mockImplementation(async (cb: any) => cb(mockManager));
    mockDataSource.query.mockResolvedValue([
      { email: 'respondent@example.com', fullName: 'Respondent', surveyTitle: 'Survey', rewardPoints: 250 },
    ]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ResponseService,
        { provide: getRepositoryToken(SurveyResponse), useValue: mockResponseRepository },
        { provide: getRepositoryToken(Answer), useValue: mockAnswerRepository },
        { provide: getRepositoryToken(ManualRewardDistribution), useValue: mockManualRewardRepository },
        { provide: SurveyTimeService, useValue: mockSurveyTimeService },
        { provide: AnswerValidationService, useValue: mockAnswerValidationService },
        { provide: DataSource, useValue: mockDataSource },
        { provide: EventEmitter2, useValue: mockEventEmitter },
      ],
    }).compile();

    service = module.get<ResponseService>(ResponseService);
    responseRepository = mockResponseRepository;
    answerRepository = mockAnswerRepository;
    manualRewardRepository = mockManualRewardRepository;
    surveyTimeService = mockSurveyTimeService;
    dataSource = mockDataSource;
    manager = mockManager;
    eventEmitter = mockEventEmitter;
  });

  describe('submitResponse', () => {
    const surveyId = 'survey-1';
    const respondentId = 'respondent-1';
    const dto = {
      answers: [{ questionId: 'q1', value: 'answer1' }],
      deviceType: 'mobile',
    };

    it('should reject submission if respondent already has a complete response', async () => {
      responseRepository.findOne.mockResolvedValue({
        id: 'resp-1',
        surveyId,
        respondentId,
        status: ResponseStatus.COMPLETE,
      });

      await expect(
        service.submitResponse(surveyId, respondentId, dto),
      ).rejects.toThrow(ConflictException);
    });

    it('should reject submission if survey time/cap check fails', async () => {
      responseRepository.findOne.mockResolvedValue(null);
      surveyTimeService.checkSubmissionAllowed.mockResolvedValue({
        allowed: false,
        reason: 'Survey has ended',
      });

      await expect(
        service.submitResponse(surveyId, respondentId, dto),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject submission if timer has expired for in-progress response', async () => {
      const inProgressResponse = {
        id: 'resp-1',
        surveyId,
        respondentId,
        status: ResponseStatus.IN_PROGRESS,
        startedAt: new Date('2024-01-01T00:00:00Z'),
      };
      responseRepository.findOne.mockResolvedValue(inProgressResponse);
      surveyTimeService.checkSubmissionAllowed.mockResolvedValue({ allowed: true });
      surveyTimeService.getTimeConfig.mockResolvedValue({ maxDurationMinutes: 30 });
      surveyTimeService.isTimerExpired.mockReturnValue(true);

      await expect(
        service.submitResponse(surveyId, respondentId, dto),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should reject implausibly fast (bot-speed) submissions', async () => {
      const inProgressResponse = {
        id: 'resp-1',
        surveyId,
        respondentId,
        status: ResponseStatus.IN_PROGRESS,
        startedAt: new Date(), // started "now" → ~0s elapsed
        deviceType: null,
      };
      responseRepository.findOne.mockResolvedValue(inProgressResponse);
      surveyTimeService.checkSubmissionAllowed.mockResolvedValue({ allowed: true });
      surveyTimeService.getTimeConfig.mockResolvedValue({ maxDurationMinutes: 30 });
      surveyTimeService.isTimerExpired.mockReturnValue(false);

      await expect(
        service.submitResponse(surveyId, respondentId, dto),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should complete an existing in-progress response', async () => {
      const inProgressResponse = {
        id: 'resp-1',
        surveyId,
        respondentId,
        status: ResponseStatus.IN_PROGRESS,
        // Started a minute ago so it passes the minimum-completion-time check
        startedAt: new Date(Date.now() - 60_000),
        deviceType: null,
      };
      responseRepository.findOne
        .mockResolvedValueOnce(inProgressResponse) // check existing
        .mockResolvedValueOnce({ ...inProgressResponse, status: ResponseStatus.COMPLETE, answers: [] }); // findResponseById

      surveyTimeService.checkSubmissionAllowed.mockResolvedValue({ allowed: true });
      surveyTimeService.getTimeConfig.mockResolvedValue({ maxDurationMinutes: 30 });
      surveyTimeService.isTimerExpired.mockReturnValue(false);
      surveyTimeService.incrementRespondentCount.mockResolvedValue(undefined);

      const result = await service.submitResponse(surveyId, respondentId, dto);

      expect(result.status).toBe(ResponseStatus.COMPLETE);
      expect(dataSource.transaction).toHaveBeenCalled();
      expect(surveyTimeService.incrementRespondentCount).toHaveBeenCalledWith(surveyId);
      // Domain event emitted to trigger reward crediting / notification / audit,
      // carrying the survey's configured reward points for the credit handler.
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        EventType.RESPONSE_SUBMITTED,
        expect.objectContaining({ surveyId, respondentId, rewardPoints: 250 }),
      );
    });

    it('should create a new complete response if no existing response', async () => {
      responseRepository.findOne
        .mockResolvedValueOnce(null) // check existing
        .mockResolvedValueOnce({ id: 'resp-new', status: ResponseStatus.COMPLETE, answers: [] }); // findResponseById

      surveyTimeService.checkSubmissionAllowed.mockResolvedValue({ allowed: true });
      surveyTimeService.incrementRespondentCount.mockResolvedValue(undefined);

      const result = await service.submitResponse(surveyId, respondentId, dto);

      expect(result.status).toBe(ResponseStatus.COMPLETE);
      expect(dataSource.transaction).toHaveBeenCalled();
      expect(surveyTimeService.incrementRespondentCount).toHaveBeenCalledWith(surveyId);
      expect(eventEmitter.emit).toHaveBeenCalledWith(
        EventType.RESPONSE_SUBMITTED,
        expect.objectContaining({ surveyId, respondentId }),
      );
    });

    it('should handle unique constraint violation gracefully', async () => {
      responseRepository.findOne.mockResolvedValue(null);
      surveyTimeService.checkSubmissionAllowed.mockResolvedValue({ allowed: true });
      // The insert inside the transaction violates the unique constraint
      manager.save.mockRejectedValueOnce({ code: '23505' });

      await expect(
        service.submitResponse(surveyId, respondentId, dto),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('saveProgress', () => {
    const surveyId = 'survey-1';
    const respondentId = 'respondent-1';
    const dto = {
      answers: [{ questionId: 'q1', value: 'partial-answer' }],
      deviceType: 'desktop',
    };

    it('should reject saving progress for a completed response', async () => {
      responseRepository.findOne.mockResolvedValue({
        id: 'resp-1',
        status: ResponseStatus.COMPLETE,
      });

      await expect(
        service.saveProgress(surveyId, respondentId, dto),
      ).rejects.toThrow(ConflictException);
    });

    it('should create a new in-progress response if none exists', async () => {
      responseRepository.findOne
        .mockResolvedValueOnce(null) // check existing
        .mockResolvedValueOnce({ id: 'resp-new', status: ResponseStatus.IN_PROGRESS, answers: [] }); // findResponseById

      responseRepository.create.mockImplementation((data) => ({ id: 'resp-new', ...data }));
      responseRepository.save.mockResolvedValue({ id: 'resp-new', status: ResponseStatus.IN_PROGRESS });

      const result = await service.saveProgress(surveyId, respondentId, dto);

      expect(result.status).toBe(ResponseStatus.IN_PROGRESS);
      // Answers are upserted via the shared entity manager
      expect(manager.query).toHaveBeenCalled();
      // Kolom jsonb: query harus cast ::jsonb dan value dikirim sbg JSON string
      // (mis. "partial-answer"), bukan string mentah yg gagal di-parse Postgres.
      const [sql, params] = (manager.query as any).mock.calls.at(-1);
      expect(sql).toContain('::jsonb');
      expect(params).toContain(JSON.stringify('partial-answer'));
    });

    it('should update answers for an existing in-progress response', async () => {
      const existingResponse = {
        id: 'resp-1',
        status: ResponseStatus.IN_PROGRESS,
      };
      responseRepository.findOne
        .mockResolvedValueOnce(existingResponse) // check existing
        .mockResolvedValueOnce({ ...existingResponse, answers: [] }); // findResponseById

      const result = await service.saveProgress(surveyId, respondentId, dto);

      expect(result).toBeDefined();
      expect(manager.query).toHaveBeenCalled();
    });
  });

  describe('getRespondentResponse', () => {
    it('should return existing response with answers', async () => {
      const response = {
        id: 'resp-1',
        surveyId: 'survey-1',
        respondentId: 'respondent-1',
        status: ResponseStatus.IN_PROGRESS,
        answers: [{ id: 'ans-1', questionId: 'q1', value: 'test' }],
      };
      responseRepository.findOne.mockResolvedValue(response);

      const result = await service.getRespondentResponse('survey-1', 'respondent-1');

      expect(result).toEqual(response);
      expect(responseRepository.findOne).toHaveBeenCalledWith({
        where: { surveyId: 'survey-1', respondentId: 'respondent-1' },
        relations: ['answers'],
      });
    });

    it('should return null if no response exists', async () => {
      responseRepository.findOne.mockResolvedValue(null);

      const result = await service.getRespondentResponse('survey-1', 'respondent-1');

      expect(result).toBeNull();
    });
  });

  describe('getResponses', () => {
    const makeQb = (rows: any[] = [], total = 0) => ({
      leftJoinAndSelect: vi.fn().mockReturnThis(),
      leftJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      orderBy: vi.fn().mockReturnThis(),
      skip: vi.fn().mockReturnThis(),
      take: vi.fn().mockReturnThis(),
      getManyAndCount: vi.fn().mockResolvedValue([rows, total]),
    });

    it('should return paginated responses with filters applied', async () => {
      const mockQb = makeQb([{ id: 'resp-1', status: ResponseStatus.COMPLETE }], 1);
      responseRepository.createQueryBuilder.mockReturnValue(mockQb);

      const result = await service.getResponses('survey-1', {
        completionStatus: ResponseStatus.COMPLETE,
        page: 1,
        pageSize: 20,
      });

      expect(result.data).toHaveLength(1);
      expect(result.meta.total).toBe(1);
      expect(mockQb.andWhere).toHaveBeenCalledWith('response.status = :status', {
        status: ResponseStatus.COMPLETE,
      });
    });

    it('should apply date range filter', async () => {
      const mockQb = makeQb();
      responseRepository.createQueryBuilder.mockReturnValue(mockQb);

      await service.getResponses('survey-1', {
        dateRange: { start: '2024-01-01', end: '2024-12-31' },
        page: 1,
        pageSize: 20,
      });

      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'response.started_at >= :startDate',
        expect.any(Object),
      );
      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'response.started_at <= :endDate',
        expect.any(Object),
      );
    });

    it('should apply region filter', async () => {
      const mockQb = makeQb();
      responseRepository.createQueryBuilder.mockReturnValue(mockQb);

      await service.getResponses('survey-1', {
        region: 'Jakarta',
        page: 1,
        pageSize: 20,
      });

      expect(mockQb.andWhere).toHaveBeenCalledWith(
        '(profile.city ILIKE :region OR profile.province ILIKE :region)',
        { region: '%Jakarta%' },
      );
    });

    it('should apply device type filter', async () => {
      const mockQb = makeQb();
      responseRepository.createQueryBuilder.mockReturnValue(mockQb);

      await service.getResponses('survey-1', {
        deviceType: 'mobile',
        page: 1,
        pageSize: 20,
      });

      expect(mockQb.andWhere).toHaveBeenCalledWith(
        'response.device_type = :deviceType',
        { deviceType: 'mobile' },
      );
    });

    it('should apply tags filter', async () => {
      const mockQb = makeQb();
      responseRepository.createQueryBuilder.mockReturnValue(mockQb);

      await service.getResponses('survey-1', {
        tags: ['vip', 'priority'],
        page: 1,
        pageSize: 20,
      });

      expect(mockQb.andWhere).toHaveBeenCalledWith('response.tags @> :tags', {
        tags: JSON.stringify(['vip', 'priority']),
      });
    });

    it('should apply multiple filters as AND conditions', async () => {
      const mockQb = makeQb();
      responseRepository.createQueryBuilder.mockReturnValue(mockQb);

      await service.getResponses('survey-1', {
        completionStatus: ResponseStatus.COMPLETE,
        deviceType: 'mobile',
        region: 'Jakarta',
        page: 1,
        pageSize: 20,
      });

      // All filters use andWhere (AND conditions)
      expect(mockQb.andWhere).toHaveBeenCalledTimes(3);
    });
  });

  describe('getManualRewardRecipients', () => {
    it('should return empty array if no complete responses', async () => {
      responseRepository.find.mockResolvedValue([]);

      const result = await service.getManualRewardRecipients('survey-1');

      expect(result).toEqual([]);
    });

    it('should only return recipients with complete responses', async () => {
      responseRepository.find.mockResolvedValue([
        { respondentId: 'user-1' },
        { respondentId: 'user-2' },
      ]);

      // Both distributions already exist — single bulk fetch, no per-row queries
      manualRewardRepository.find.mockResolvedValue([
        {
          id: 'dist-1',
          surveyId: 'survey-1',
          respondentId: 'user-1',
          status: ManualRewardStatus.PENDING,
          respondent: { id: 'user-1', fullName: 'User 1' },
        },
        {
          id: 'dist-2',
          surveyId: 'survey-1',
          respondentId: 'user-2',
          status: ManualRewardStatus.PENDING,
          respondent: { id: 'user-2', fullName: 'User 2' },
        },
      ]);

      const result = await service.getManualRewardRecipients('survey-1');

      expect(result).toHaveLength(2);
      expect(manualRewardRepository.findOne).not.toHaveBeenCalled();
    });

    it('should create distribution record if not exists', async () => {
      responseRepository.find.mockResolvedValue([{ respondentId: 'user-1' }]);

      manualRewardRepository.find
        .mockResolvedValueOnce([]) // no existing distributions
        .mockResolvedValueOnce([
          {
            id: 'dist-new',
            surveyId: 'survey-1',
            respondentId: 'user-1',
            status: ManualRewardStatus.PENDING,
            respondent: { id: 'user-1', fullName: 'User 1' },
          },
        ]); // re-fetch after bulk insert
      manualRewardRepository.create.mockImplementation((data) => data);
      manualRewardRepository.save.mockResolvedValue([{ id: 'dist-new' }]);

      const result = await service.getManualRewardRecipients('survey-1');

      expect(result).toHaveLength(1);
      expect(manualRewardRepository.create).toHaveBeenCalled();
      expect(manualRewardRepository.save).toHaveBeenCalled();
    });
  });

  describe('markRewardDistributed', () => {
    const surveyId = 'survey-1';
    const adminId = 'admin-1';

    it('should mark reward as distributed for respondents with complete responses', async () => {
      responseRepository.findOne.mockResolvedValue({
        id: 'resp-1',
        surveyId,
        respondentId: 'user-1',
        status: ResponseStatus.COMPLETE,
      });
      manualRewardRepository.findOne.mockResolvedValue({
        id: 'dist-1',
        surveyId,
        respondentId: 'user-1',
        status: ManualRewardStatus.PENDING,
      });
      manualRewardRepository.save.mockImplementation((entity) => Promise.resolve(entity));

      const result = await service.markRewardDistributed(surveyId, ['user-1'], adminId);

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe(ManualRewardStatus.DISTRIBUTED);
      expect(result[0].distributedBy).toBe(adminId);
      expect(result[0].distributedAt).toBeInstanceOf(Date);
    });

    it('should skip respondents without complete responses', async () => {
      responseRepository.findOne.mockResolvedValue(null);

      const result = await service.markRewardDistributed(surveyId, ['user-1'], adminId);

      expect(result).toHaveLength(0);
      expect(manualRewardRepository.save).not.toHaveBeenCalled();
    });

    it('should create distribution record if not exists and mark as distributed', async () => {
      responseRepository.findOne.mockResolvedValue({
        id: 'resp-1',
        surveyId,
        respondentId: 'user-1',
        status: ResponseStatus.COMPLETE,
      });
      manualRewardRepository.findOne.mockResolvedValue(null);
      manualRewardRepository.create.mockImplementation((data) => data);
      manualRewardRepository.save.mockImplementation((entity) => Promise.resolve(entity));

      const result = await service.markRewardDistributed(surveyId, ['user-1'], adminId);

      expect(result).toHaveLength(1);
      expect(result[0].status).toBe(ManualRewardStatus.DISTRIBUTED);
      expect(result[0].distributedBy).toBe(adminId);
    });

    it('should handle bulk distribution for multiple respondents', async () => {
      responseRepository.findOne.mockResolvedValue({
        id: 'resp-1',
        status: ResponseStatus.COMPLETE,
      });
      manualRewardRepository.findOne.mockResolvedValue({
        id: 'dist-1',
        status: ManualRewardStatus.PENDING,
      });
      manualRewardRepository.save.mockImplementation((entity) => Promise.resolve(entity));

      const result = await service.markRewardDistributed(
        surveyId,
        ['user-1', 'user-2', 'user-3'],
        adminId,
      );

      expect(result).toHaveLength(3);
      result.forEach((r) => {
        expect(r.status).toBe(ManualRewardStatus.DISTRIBUTED);
        expect(r.distributedBy).toBe(adminId);
      });
    });
  });

  describe('deleteResponse', () => {
    it('deletes answers + response and frees the quota for a complete response', async () => {
      responseRepository.findOne.mockResolvedValue({
        id: 'resp-1',
        surveyId: 'survey-1',
        status: ResponseStatus.COMPLETE,
      });
      manager.delete.mockResolvedValue({ affected: 1 });
      surveyTimeService.decrementRespondentCount.mockResolvedValue(undefined);

      const result = await service.deleteResponse('resp-1');

      expect(result).toEqual({ deleted: true, surveyId: 'survey-1' });
      expect(dataSource.transaction).toHaveBeenCalled();
      expect(manager.delete).toHaveBeenCalledWith(Answer, { responseId: 'resp-1' });
      expect(manager.delete).toHaveBeenCalledWith(SurveyResponse, { id: 'resp-1' });
      expect(surveyTimeService.decrementRespondentCount).toHaveBeenCalledWith('survey-1');
    });

    it('does NOT decrement the quota for an in-progress response', async () => {
      responseRepository.findOne.mockResolvedValue({
        id: 'resp-2',
        surveyId: 'survey-1',
        status: ResponseStatus.IN_PROGRESS,
      });
      manager.delete.mockResolvedValue({ affected: 1 });

      await service.deleteResponse('resp-2');

      expect(surveyTimeService.decrementRespondentCount).not.toHaveBeenCalled();
    });

    it('throws NotFound when the response does not exist', async () => {
      responseRepository.findOne.mockResolvedValue(null);
      await expect(service.deleteResponse('missing')).rejects.toThrow();
    });
  });
});
