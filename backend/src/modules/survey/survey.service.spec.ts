import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { SurveyService } from './survey.service';
import { Survey } from './entities/survey.entity';
import { SurveyTimeConfig } from './entities/survey-time-config.entity';
import { SurveyRewardConfig } from './entities/survey-reward-config.entity';
import { Question } from './entities/question.entity';
import { SurveyStatus } from '@shared/enums';
import { CreateSurveyDto } from './dto/create-survey.dto';
import { UpdateSurveyDto } from './dto/update-survey.dto';
import { QuestionService } from './question.service';

describe('SurveyService', () => {
  let service: SurveyService;
  let surveyRepository: any;
  let timeConfigRepository: any;
  let rewardConfigRepository: any;
  let questionRepository: any;
  let questionService: any;

  const mockUserId = 'user-uuid-123';

  let mockSurvey: Partial<Survey>;

  function createMockSurvey(): Partial<Survey> {
    return {
      id: 'survey-uuid-1',
      createdBy: mockUserId,
      title: 'Test Survey',
      description: 'A test survey',
      status: SurveyStatus.DRAFT,
      rewardMode: 'automatic',
      startDatetime: new Date('2025-01-01T00:00:00Z'),
      endDatetime: new Date('2025-02-01T00:00:00Z'),
      maxDurationMinutes: 30,
      maxRespondents: 100,
      randomizeOptions: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      archivedAt: null,
      timeConfig: {
        id: 'tc-uuid-1',
        surveyId: 'survey-uuid-1',
        startDatetime: new Date('2025-01-01T00:00:00Z'),
        endDatetime: new Date('2025-02-01T00:00:00Z'),
        maxDurationMinutes: 30,
        maxRespondents: 100,
        currentRespondentCount: 0,
      } as SurveyTimeConfig,
      rewardConfig: {
        id: 'rc-uuid-1',
        surveyId: 'survey-uuid-1',
        rewardMode: 'automatic',
        pointsValue: 5000,
        manualRewardType: null,
        manualRewardNominal: null,
      } as SurveyRewardConfig,
    };
  }

  beforeEach(async () => {
    mockSurvey = createMockSurvey();

    surveyRepository = {
      create: vi.fn().mockImplementation((data) => ({ ...data, id: 'survey-uuid-1' })),
      save: vi.fn().mockImplementation((entity) => Promise.resolve({ ...mockSurvey, ...entity })),
      findOne: vi.fn().mockImplementation(() => Promise.resolve(createMockSurvey())),
      remove: vi.fn().mockResolvedValue(undefined),
    };

    timeConfigRepository = {
      create: vi.fn().mockImplementation((data) => ({ ...data, id: 'tc-uuid-1' })),
      save: vi.fn().mockImplementation((entity) => Promise.resolve(entity)),
      findOne: vi.fn().mockResolvedValue(mockSurvey.timeConfig),
    };

    rewardConfigRepository = {
      create: vi.fn().mockImplementation((data) => ({ ...data, id: 'rc-uuid-1' })),
      save: vi.fn().mockImplementation((entity) => Promise.resolve(entity)),
      findOne: vi.fn().mockResolvedValue(mockSurvey.rewardConfig),
    };

    questionRepository = {
      count: vi.fn().mockResolvedValue(0),
      find: vi.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SurveyService,
        { provide: getRepositoryToken(Survey), useValue: surveyRepository },
        { provide: getRepositoryToken(SurveyTimeConfig), useValue: timeConfigRepository },
        { provide: getRepositoryToken(SurveyRewardConfig), useValue: rewardConfigRepository },
        { provide: getRepositoryToken(Question), useValue: questionRepository },
        {
          provide: QuestionService,
          useValue: {
            bulkReplaceQuestions: vi.fn().mockResolvedValue([]),
            getSurveyLogicRules: vi.fn().mockResolvedValue({ skip: [], visibility: [] }),
          },
        },
      ],
    }).compile();

    service = module.get<SurveyService>(SurveyService);
    questionService = module.get<QuestionService>(QuestionService);
  });

  describe('createSurvey', () => {
    it('should create a survey with time config and reward config', async () => {
      const dto: CreateSurveyDto = {
        title: 'Test Survey',
        description: 'A test survey',
        rewardMode: 'automatic',
        randomizeOptions: false,
        timeConfig: {
          startDatetime: '2025-01-01T00:00:00Z',
          endDatetime: '2025-02-01T00:00:00Z',
          maxDurationMinutes: 30,
          maxRespondents: 100,
        },
        rewardConfig: {
          rewardMode: 'automatic',
          pointsValue: 5000,
        },
      };

      const result = await service.createSurvey(mockUserId, dto);

      expect(surveyRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          createdBy: mockUserId,
          title: 'Test Survey',
          rewardMode: 'automatic',
          status: SurveyStatus.DRAFT,
        }),
      );
      expect(surveyRepository.save).toHaveBeenCalled();
      expect(timeConfigRepository.create).toHaveBeenCalled();
      expect(timeConfigRepository.save).toHaveBeenCalled();
      expect(rewardConfigRepository.create).toHaveBeenCalled();
      expect(rewardConfigRepository.save).toHaveBeenCalled();
      expect(result).toBeDefined();
      expect(result.title).toBe('Test Survey');
    });

    it('should create a survey with manual reward mode', async () => {
      const dto: CreateSurveyDto = {
        title: 'Manual Reward Survey',
        rewardMode: 'manual',
        rewardConfig: {
          rewardMode: 'manual',
          manualRewardType: 'pulsa',
          manualRewardNominal: 50000,
        },
      };

      await service.createSurvey(mockUserId, dto);

      expect(rewardConfigRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          rewardMode: 'manual',
          manualRewardType: 'pulsa',
          manualRewardNominal: 50000,
        }),
      );
    });

    it('should default status to DRAFT', async () => {
      const dto: CreateSurveyDto = {
        title: 'New Survey',
        rewardMode: 'automatic',
      };

      await service.createSurvey(mockUserId, dto);

      expect(surveyRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: SurveyStatus.DRAFT,
        }),
      );
    });
  });

  describe('updateSurvey', () => {
    it('should update survey title and description', async () => {
      const dto: UpdateSurveyDto = {
        title: 'Updated Title',
        description: 'Updated description',
      };

      const result = await service.updateSurvey('survey-uuid-1', dto);

      expect(surveyRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'survey-uuid-1' },
        relations: ['timeConfig', 'rewardConfig'],
      });
      expect(surveyRepository.save).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should update time config', async () => {
      const dto: UpdateSurveyDto = {
        timeConfig: {
          maxRespondents: 200,
        },
      };

      await service.updateSurvey('survey-uuid-1', dto);

      expect(timeConfigRepository.findOne).toHaveBeenCalledWith({
        where: { surveyId: 'survey-uuid-1' },
      });
      expect(timeConfigRepository.save).toHaveBeenCalled();
    });

    it('should throw NotFoundException if survey does not exist', async () => {
      surveyRepository.findOne.mockResolvedValue(null);

      await expect(service.updateSurvey('non-existent', { title: 'X' })).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('duplicateSurvey', () => {
    it('should create a copy of the survey with "(Copy)" suffix', async () => {
      const result = await service.duplicateSurvey('survey-uuid-1', mockUserId);

      expect(surveyRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Test Survey (Copy)',
          createdBy: mockUserId,
        }),
      );
      expect(result).toBeDefined();
    });

    it('should throw NotFoundException if original survey does not exist', async () => {
      surveyRepository.findOne.mockResolvedValue(null);

      await expect(service.duplicateSurvey('non-existent', mockUserId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('copies the original questions into the duplicate', async () => {
      questionRepository.find.mockResolvedValue([
        {
          id: 'q-1',
          type: 'single_choice',
          questionText: 'Pilih satu',
          required: true,
          enabled: true,
          orderIndex: 0,
          hasOtherOption: false,
          validationRules: null,
          options: [
            { label: 'Ya', value: 'ya', orderIndex: 0 },
            { label: 'Tidak', value: 'tidak', orderIndex: 1 },
          ],
        },
      ]);

      await service.duplicateSurvey('survey-uuid-1', mockUserId);

      expect(questionService.bulkReplaceQuestions).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([
          expect.objectContaining({
            type: 'single_choice',
            text: 'Pilih satu',
            options: [
              { label: 'Ya', value: 'ya', orderIndex: 0 },
              { label: 'Tidak', value: 'tidak', orderIndex: 1 },
            ],
          }),
        ]),
      );
    });
  });

  describe('deactivateSurvey', () => {
    it('should set survey status to INACTIVE', async () => {
      const result = await service.deactivateSurvey('survey-uuid-1');

      expect(surveyRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: SurveyStatus.INACTIVE,
        }),
      );
      expect(result).toBeDefined();
    });

    it('should throw BadRequestException if survey is archived', async () => {
      surveyRepository.findOne.mockImplementation(() =>
        Promise.resolve({ ...createMockSurvey(), status: SurveyStatus.ARCHIVED }),
      );

      await expect(service.deactivateSurvey('survey-uuid-1')).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException if survey does not exist', async () => {
      surveyRepository.findOne.mockResolvedValue(null);

      await expect(service.deactivateSurvey('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteSurvey', () => {
    it('should remove the survey', async () => {
      await service.deleteSurvey('survey-uuid-1');

      expect(surveyRepository.remove).toHaveBeenCalled();
    });

    it('should throw NotFoundException if survey does not exist', async () => {
      surveyRepository.findOne.mockResolvedValue(null);

      await expect(service.deleteSurvey('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('archiveSurvey', () => {
    it('should set survey status to ARCHIVED and set archivedAt', async () => {
      const result = await service.archiveSurvey('survey-uuid-1');

      expect(surveyRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: SurveyStatus.ARCHIVED,
          archivedAt: expect.any(Date),
        }),
      );
      expect(result).toBeDefined();
    });

    it('should throw NotFoundException if survey does not exist', async () => {
      surveyRepository.findOne.mockResolvedValue(null);

      await expect(service.archiveSurvey('non-existent')).rejects.toThrow(NotFoundException);
    });
  });

  describe('findById', () => {
    it('should return survey with relations', async () => {
      const result = await service.findById('survey-uuid-1');

      expect(result).toBeDefined();
      expect(result.title).toBe('Test Survey');
      expect(surveyRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'survey-uuid-1' },
        relations: ['timeConfig', 'rewardConfig'],
      });
    });

    it('should throw NotFoundException if not found', async () => {
      surveyRepository.findOne.mockResolvedValue(null);

      await expect(service.findById('non-existent')).rejects.toThrow(NotFoundException);
    });
  });
});
