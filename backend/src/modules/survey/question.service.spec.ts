import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { QuestionService } from './question.service';
import { Question } from './entities/question.entity';
import { QuestionOption } from './entities/question-option.entity';
import { Survey } from './entities/survey.entity';
import { SurveyPage } from './entities/survey-page.entity';
import { QuestionType } from '@shared/enums';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { ReorderQuestionsDto } from './dto/reorder-questions.dto';

describe('QuestionService', () => {
  let service: QuestionService;
  let questionRepository: any;
  let optionRepository: any;
  let surveyRepository: any;
  let pageRepository: any;

  const mockSurveyId = 'survey-uuid-1';
  const mockPageId = 'page-uuid-1';
  const mockQuestionId = 'question-uuid-1';

  const mockSurvey = { id: mockSurveyId, title: 'Test Survey' };
  const mockPage = { id: mockPageId, surveyId: mockSurveyId, pageNumber: 1 };

  function createMockQuestion(overrides: Partial<Question> = {}): Partial<Question> {
    return {
      id: mockQuestionId,
      surveyId: mockSurveyId,
      pageId: mockPageId,
      type: QuestionType.SHORT_TEXT,
      questionText: 'What is your name?',
      required: false,
      orderIndex: 0,
      validationRules: null,
      hasOtherOption: false,
      createdAt: new Date(),
      options: [],
      ...overrides,
    };
  }

  beforeEach(async () => {
    const mockQueryBuilder = {
      select: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      getRawOne: vi.fn().mockResolvedValue({ max: 2 }),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      execute: vi.fn().mockResolvedValue(undefined),
    };

    questionRepository = {
      create: vi.fn().mockImplementation((data) => ({ ...data, id: mockQuestionId })),
      save: vi.fn().mockImplementation((entity) =>
        Promise.resolve(Array.isArray(entity) ? entity : { ...createMockQuestion(), ...entity }),
      ),
      findOne: vi.fn().mockImplementation(() => Promise.resolve(createMockQuestion())),
      find: vi.fn().mockResolvedValue([
        createMockQuestion({ id: 'q1', orderIndex: 0 }),
        createMockQuestion({ id: 'q2', orderIndex: 1 }),
      ]),
      remove: vi.fn().mockResolvedValue(undefined),
      update: vi.fn().mockResolvedValue({ affected: 1 }),
      delete: vi.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: vi.fn().mockReturnValue(mockQueryBuilder),
    };

    optionRepository = {
      create: vi.fn().mockImplementation((data) => ({ ...data, id: 'opt-uuid-1' })),
      save: vi.fn().mockImplementation((entities) => Promise.resolve(entities)),
      delete: vi.fn().mockResolvedValue({ affected: 1 }),
    };

    surveyRepository = {
      findOne: vi.fn().mockResolvedValue(mockSurvey),
    };

    pageRepository = {
      findOne: vi.fn().mockResolvedValue(mockPage),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuestionService,
        { provide: getRepositoryToken(Question), useValue: questionRepository },
        { provide: getRepositoryToken(QuestionOption), useValue: optionRepository },
        { provide: getRepositoryToken(Survey), useValue: surveyRepository },
        { provide: getRepositoryToken(SurveyPage), useValue: pageRepository },
      ],
    }).compile();

    service = module.get<QuestionService>(QuestionService);
  });

  describe('addQuestion', () => {
    it('should create a short_text question', async () => {
      const dto: CreateQuestionDto = {
        type: QuestionType.SHORT_TEXT,
        text: 'What is your name?',
        required: true,
        pageId: mockPageId,
      };

      const result = await service.addQuestion(mockSurveyId, dto);

      expect(questionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          surveyId: mockSurveyId,
          pageId: mockPageId,
          type: QuestionType.SHORT_TEXT,
          questionText: 'What is your name?',
          required: true,
        }),
      );
      expect(questionRepository.save).toHaveBeenCalled();
      expect(result).toBeDefined();
    });

    it('should create a single_choice question with options', async () => {
      const dto: CreateQuestionDto = {
        type: QuestionType.SINGLE_CHOICE,
        text: 'What is your gender?',
        pageId: mockPageId,
        options: [
          { label: 'Male', value: 'male' },
          { label: 'Female', value: 'female' },
        ],
      };

      await service.addQuestion(mockSurveyId, dto);

      expect(optionRepository.create).toHaveBeenCalledTimes(2);
      expect(optionRepository.save).toHaveBeenCalled();
    });

    it('should create a multiple_choice question with hasOtherOption', async () => {
      const dto: CreateQuestionDto = {
        type: QuestionType.MULTIPLE_CHOICE,
        text: 'Select your hobbies',
        pageId: mockPageId,
        hasOtherOption: true,
        options: [
          { label: 'Reading', value: 'reading' },
          { label: 'Sports', value: 'sports' },
        ],
      };

      await service.addQuestion(mockSurveyId, dto);

      expect(questionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          hasOtherOption: true,
        }),
      );
    });

    it('should reject hasOtherOption for non-choice question types', async () => {
      const dto: CreateQuestionDto = {
        type: QuestionType.LONG_TEXT,
        text: 'Describe yourself',
        pageId: mockPageId,
        hasOtherOption: true,
      };

      await expect(service.addQuestion(mockSurveyId, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject choice questions without options', async () => {
      const dto: CreateQuestionDto = {
        type: QuestionType.SINGLE_CHOICE,
        text: 'Pick one',
        pageId: mockPageId,
        options: [],
      };

      await expect(service.addQuestion(mockSurveyId, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw NotFoundException if survey does not exist', async () => {
      surveyRepository.findOne.mockResolvedValue(null);

      const dto: CreateQuestionDto = {
        type: QuestionType.SHORT_TEXT,
        text: 'Test',
        pageId: mockPageId,
      };

      await expect(service.addQuestion('non-existent', dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw NotFoundException if page does not exist', async () => {
      pageRepository.findOne.mockResolvedValue(null);

      const dto: CreateQuestionDto = {
        type: QuestionType.SHORT_TEXT,
        text: 'Test',
        pageId: 'non-existent-page',
      };

      await expect(service.addQuestion(mockSurveyId, dto)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should create a phone_number question with phoneFormat validation', async () => {
      const dto: CreateQuestionDto = {
        type: QuestionType.PHONE_NUMBER,
        text: 'Enter your phone number',
        pageId: mockPageId,
        validationRules: { phoneFormat: true },
      };

      await service.addQuestion(mockSurveyId, dto);

      expect(questionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          validationRules: { phoneFormat: true },
        }),
      );
    });

    it('should create a numeric_scale question with numericRange validation', async () => {
      const dto: CreateQuestionDto = {
        type: QuestionType.NUMERIC_SCALE,
        text: 'Rate from 1 to 10',
        pageId: mockPageId,
        validationRules: { numericRange: { min: 1, max: 10 } },
      };

      await service.addQuestion(mockSurveyId, dto);

      expect(questionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          validationRules: { numericRange: { min: 1, max: 10 } },
        }),
      );
    });

    it('should create a multiple_choice question with maxCheckbox validation', async () => {
      const dto: CreateQuestionDto = {
        type: QuestionType.MULTIPLE_CHOICE,
        text: 'Select up to 3',
        pageId: mockPageId,
        options: [
          { label: 'A', value: 'a' },
          { label: 'B', value: 'b' },
          { label: 'C', value: 'c' },
          { label: 'D', value: 'd' },
        ],
        validationRules: { maxCheckbox: 3 },
      };

      await service.addQuestion(mockSurveyId, dto);

      expect(questionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          validationRules: { maxCheckbox: 3 },
        }),
      );
    });

    it('should reject maxCheckbox for non-multiple_choice questions', async () => {
      const dto: CreateQuestionDto = {
        type: QuestionType.SINGLE_CHOICE,
        text: 'Pick one',
        pageId: mockPageId,
        options: [{ label: 'A', value: 'a' }],
        validationRules: { maxCheckbox: 2 },
      };

      await expect(service.addQuestion(mockSurveyId, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should create a short_text question with email format validation', async () => {
      const dto: CreateQuestionDto = {
        type: QuestionType.SHORT_TEXT,
        text: 'Enter your email',
        pageId: mockPageId,
        validationRules: { emailFormat: true },
      };

      await service.addQuestion(mockSurveyId, dto);

      expect(questionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          validationRules: { emailFormat: true },
        }),
      );
    });

    it('should create a short_text question with minLength/maxLength validation', async () => {
      const dto: CreateQuestionDto = {
        type: QuestionType.SHORT_TEXT,
        text: 'Enter your name',
        pageId: mockPageId,
        validationRules: { minLength: 2, maxLength: 100 },
      };

      await service.addQuestion(mockSurveyId, dto);

      expect(questionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          validationRules: { minLength: 2, maxLength: 100 },
        }),
      );
    });

    it('should create a short_text question with regex validation', async () => {
      const dto: CreateQuestionDto = {
        type: QuestionType.SHORT_TEXT,
        text: 'Enter ID number',
        pageId: mockPageId,
        validationRules: { regex: '^[0-9]{16}$' },
      };

      await service.addQuestion(mockSurveyId, dto);

      expect(questionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          validationRules: { regex: '^[0-9]{16}$' },
        }),
      );
    });

    it('should auto-assign order_index when not provided', async () => {
      const dto: CreateQuestionDto = {
        type: QuestionType.SHORT_TEXT,
        text: 'Test question',
        pageId: mockPageId,
      };

      await service.addQuestion(mockSurveyId, dto);

      expect(questionRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          orderIndex: 3, // max was 2, so next is 3
        }),
      );
    });

    it('should support all question types', async () => {
      const allTypes = Object.values(QuestionType);
      // Lower bound, bukan angka pasti, agar tidak rapuh saat tipe baru ditambah.
      expect(allTypes.length).toBeGreaterThanOrEqual(18);

      for (const type of allTypes) {
        questionRepository.create.mockClear();
        questionRepository.save.mockClear();
        optionRepository.create.mockClear();
        optionRepository.save.mockClear();

        const dto: CreateQuestionDto = {
          type,
          text: `Question of type ${type}`,
          pageId: mockPageId,
          options:
            [
              QuestionType.SINGLE_CHOICE,
              QuestionType.MULTIPLE_CHOICE,
              QuestionType.DROPDOWN,
              QuestionType.MATRIX_LIKERT,
            ].includes(type)
              ? [{ label: 'Option 1', value: 'opt1' }]
              : undefined,
        };

        const result = await service.addQuestion(mockSurveyId, dto);
        expect(result).toBeDefined();
      }
    });
  });

  describe('updateQuestion', () => {
    it('should update question text', async () => {
      const dto: UpdateQuestionDto = {
        text: 'Updated question text',
      };

      const result = await service.updateQuestion(mockQuestionId, dto);

      expect(questionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          questionText: 'Updated question text',
        }),
      );
      expect(result).toBeDefined();
    });

    it('should update question options (replace all)', async () => {
      const dto: UpdateQuestionDto = {
        options: [
          { label: 'New Option 1', value: 'new1' },
          { label: 'New Option 2', value: 'new2' },
        ],
      };

      await service.updateQuestion(mockQuestionId, dto);

      expect(optionRepository.delete).toHaveBeenCalledWith({
        questionId: mockQuestionId,
      });
      expect(optionRepository.create).toHaveBeenCalledTimes(2);
      expect(optionRepository.save).toHaveBeenCalled();
    });

    it('should update validation rules', async () => {
      questionRepository.findOne.mockResolvedValue(
        createMockQuestion({ type: QuestionType.SHORT_TEXT }),
      );

      const dto: UpdateQuestionDto = {
        validationRules: { minLength: 5, maxLength: 200 },
      };

      await service.updateQuestion(mockQuestionId, dto);

      expect(questionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          validationRules: { minLength: 5, maxLength: 200 },
        }),
      );
    });

    it('should update hasOtherOption', async () => {
      questionRepository.findOne.mockResolvedValue(
        createMockQuestion({ type: QuestionType.SINGLE_CHOICE }),
      );

      const dto: UpdateQuestionDto = {
        hasOtherOption: true,
      };

      await service.updateQuestion(mockQuestionId, dto);

      expect(questionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          hasOtherOption: true,
        }),
      );
    });

    it('should throw NotFoundException if question does not exist', async () => {
      questionRepository.findOne.mockResolvedValue(null);

      await expect(
        service.updateQuestion('non-existent', { text: 'X' }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw NotFoundException if new page does not belong to survey', async () => {
      pageRepository.findOne.mockResolvedValue(null);

      const dto: UpdateQuestionDto = {
        pageId: 'invalid-page-id',
      };

      await expect(
        service.updateQuestion(mockQuestionId, dto),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteQuestion', () => {
    it('should remove the question and reorder remaining', async () => {
      await service.deleteQuestion(mockQuestionId);

      expect(questionRepository.remove).toHaveBeenCalled();
      expect(questionRepository.createQueryBuilder).toHaveBeenCalled();
    });

    it('should throw NotFoundException if question does not exist', async () => {
      questionRepository.findOne.mockResolvedValue(null);

      await expect(service.deleteQuestion('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('reorderQuestions', () => {
    it('should update order_index for all provided question IDs', async () => {
      const dto: ReorderQuestionsDto = {
        questionIds: ['q2', 'q1'],
      };

      await service.reorderQuestions(mockSurveyId, dto);

      expect(questionRepository.update).toHaveBeenCalledWith('q2', {
        orderIndex: 0,
      });
      expect(questionRepository.update).toHaveBeenCalledWith('q1', {
        orderIndex: 1,
      });
    });

    it('should throw NotFoundException if survey does not exist', async () => {
      surveyRepository.findOne.mockResolvedValue(null);

      const dto: ReorderQuestionsDto = { questionIds: ['q1'] };

      await expect(
        service.reorderQuestions('non-existent', dto),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException if question does not belong to survey', async () => {
      const dto: ReorderQuestionsDto = {
        questionIds: ['q1', 'q2', 'non-existent-q'],
      };

      await expect(
        service.reorderQuestions(mockSurveyId, dto),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getQuestionsBySurvey', () => {
    it('should return questions ordered by orderIndex', async () => {
      const result = await service.getQuestionsBySurvey(mockSurveyId);

      expect(questionRepository.find).toHaveBeenCalledWith({
        where: { surveyId: mockSurveyId },
        relations: ['options'],
        order: { orderIndex: 'ASC' },
      });
      expect(result).toHaveLength(2);
    });

    it('should throw NotFoundException if survey does not exist', async () => {
      surveyRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getQuestionsBySurvey('non-existent'),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('validation rules enforcement', () => {
    it('should reject emailFormat for non-short_text questions', async () => {
      const dto: CreateQuestionDto = {
        type: QuestionType.LONG_TEXT,
        text: 'Enter email',
        pageId: mockPageId,
        validationRules: { emailFormat: true },
      };

      await expect(service.addQuestion(mockSurveyId, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject phoneFormat for non-phone/short_text questions', async () => {
      const dto: CreateQuestionDto = {
        type: QuestionType.LONG_TEXT,
        text: 'Enter phone',
        pageId: mockPageId,
        validationRules: { phoneFormat: true },
      };

      await expect(service.addQuestion(mockSurveyId, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject numericRange for non-numeric_scale questions', async () => {
      const dto: CreateQuestionDto = {
        type: QuestionType.SHORT_TEXT,
        text: 'Enter number',
        pageId: mockPageId,
        validationRules: { numericRange: { min: 1, max: 10 } },
      };

      await expect(service.addQuestion(mockSurveyId, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject minLength/maxLength for non-text questions', async () => {
      const dto: CreateQuestionDto = {
        type: QuestionType.SINGLE_CHOICE,
        text: 'Pick one',
        pageId: mockPageId,
        options: [{ label: 'A', value: 'a' }],
        validationRules: { minLength: 5 },
      };

      await expect(service.addQuestion(mockSurveyId, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should allow phoneFormat for phone_number type', async () => {
      const dto: CreateQuestionDto = {
        type: QuestionType.PHONE_NUMBER,
        text: 'Phone',
        pageId: mockPageId,
        validationRules: { phoneFormat: true },
      };

      const result = await service.addQuestion(mockSurveyId, dto);
      expect(result).toBeDefined();
    });

    it('should allow phoneFormat for short_text type', async () => {
      const dto: CreateQuestionDto = {
        type: QuestionType.SHORT_TEXT,
        text: 'Phone',
        pageId: mockPageId,
        validationRules: { phoneFormat: true },
      };

      const result = await service.addQuestion(mockSurveyId, dto);
      expect(result).toBeDefined();
    });
  });

  describe('hasOtherOption support', () => {
    it('should allow hasOtherOption for single_choice', async () => {
      const dto: CreateQuestionDto = {
        type: QuestionType.SINGLE_CHOICE,
        text: 'Pick one',
        pageId: mockPageId,
        hasOtherOption: true,
        options: [{ label: 'A', value: 'a' }],
      };

      const result = await service.addQuestion(mockSurveyId, dto);
      expect(result).toBeDefined();
    });

    it('should allow hasOtherOption for dropdown', async () => {
      const dto: CreateQuestionDto = {
        type: QuestionType.DROPDOWN,
        text: 'Select one',
        pageId: mockPageId,
        hasOtherOption: true,
        options: [{ label: 'A', value: 'a' }],
      };

      const result = await service.addQuestion(mockSurveyId, dto);
      expect(result).toBeDefined();
    });

    it('should reject hasOtherOption for numeric_scale', async () => {
      const dto: CreateQuestionDto = {
        type: QuestionType.NUMERIC_SCALE,
        text: 'Rate',
        pageId: mockPageId,
        hasOtherOption: true,
      };

      await expect(service.addQuestion(mockSurveyId, dto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject hasOtherOption for file_upload', async () => {
      const dto: CreateQuestionDto = {
        type: QuestionType.FILE_UPLOAD,
        text: 'Upload',
        pageId: mockPageId,
        hasOtherOption: true,
      };

      await expect(service.addQuestion(mockSurveyId, dto)).rejects.toThrow(
        BadRequestException,
      );
    });
  });
});
