import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OptionRandomizerService } from './option-randomizer';
import { QuestionOption } from '../entities/question-option.entity';
import { Question } from '../entities/question.entity';
import { Survey } from '../entities/survey.entity';
import { NotFoundException } from '@nestjs/common';

function createMockOption(id: string, label: string, orderIndex: number): QuestionOption {
  const option = new QuestionOption();
  option.id = id;
  option.label = label;
  option.value = label.toLowerCase();
  option.orderIndex = orderIndex;
  option.questionId = 'q1';
  return option;
}

describe('OptionRandomizerService', () => {
  let service: OptionRandomizerService;
  let mockQuestionRepository: any;
  let mockSurveyRepository: any;

  beforeEach(() => {
    mockQuestionRepository = {
      find: vi.fn(),
    };
    mockSurveyRepository = {
      findOne: vi.fn(),
    };

    service = new OptionRandomizerService(
      mockQuestionRepository,
      mockSurveyRepository,
    );
  });

  describe('shuffleOptions', () => {
    it('should return an array with the same length', () => {
      const options = [
        createMockOption('1', 'Option A', 0),
        createMockOption('2', 'Option B', 1),
        createMockOption('3', 'Option C', 2),
        createMockOption('4', 'Option D', 3),
      ];

      const result = service.shuffleOptions(options);
      expect(result).toHaveLength(options.length);
    });

    it('should contain exactly the same elements (preserves set)', () => {
      const options = [
        createMockOption('1', 'Option A', 0),
        createMockOption('2', 'Option B', 1),
        createMockOption('3', 'Option C', 2),
        createMockOption('4', 'Option D', 3),
        createMockOption('5', 'Option E', 4),
      ];

      const result = service.shuffleOptions(options);

      const originalIds = options.map((o) => o.id).sort();
      const resultIds = result.map((o) => o.id).sort();
      expect(resultIds).toEqual(originalIds);
    });

    it('should not mutate the original array', () => {
      const options = [
        createMockOption('1', 'Option A', 0),
        createMockOption('2', 'Option B', 1),
        createMockOption('3', 'Option C', 2),
      ];
      const originalOrder = options.map((o) => o.id);

      service.shuffleOptions(options);

      expect(options.map((o) => o.id)).toEqual(originalOrder);
    });

    it('should return an empty array for empty input', () => {
      const result = service.shuffleOptions([]);
      expect(result).toEqual([]);
    });

    it('should return a single-element array unchanged', () => {
      const options = [createMockOption('1', 'Only Option', 0)];
      const result = service.shuffleOptions(options);
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('1');
    });

    it('should preserve all option properties', () => {
      const options = [
        createMockOption('1', 'Option A', 0),
        createMockOption('2', 'Option B', 1),
      ];

      const result = service.shuffleOptions(options);

      for (const resultOption of result) {
        const original = options.find((o) => o.id === resultOption.id);
        expect(original).toBeDefined();
        expect(resultOption.label).toBe(original!.label);
        expect(resultOption.value).toBe(original!.value);
        expect(resultOption.questionId).toBe(original!.questionId);
      }
    });
  });

  describe('getRandomizedQuestions', () => {
    it('should throw NotFoundException if survey does not exist', async () => {
      mockSurveyRepository.findOne.mockResolvedValue(null);

      await expect(
        service.getRandomizedQuestions('non-existent-id'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return questions without shuffling if randomizeOptions is false', async () => {
      const survey = { id: 'survey-1', randomizeOptions: false } as Survey;
      const questions = [
        {
          id: 'q1',
          surveyId: 'survey-1',
          options: [
            createMockOption('1', 'A', 0),
            createMockOption('2', 'B', 1),
          ],
        },
      ] as Question[];

      mockSurveyRepository.findOne.mockResolvedValue(survey);
      mockQuestionRepository.find.mockResolvedValue(questions);

      const result = await service.getRandomizedQuestions('survey-1');

      expect(result).toEqual(questions);
      expect(result[0].options[0].id).toBe('1');
      expect(result[0].options[1].id).toBe('2');
    });

    it('should return questions with shuffled options if randomizeOptions is true', async () => {
      const survey = { id: 'survey-1', randomizeOptions: true } as Survey;
      const options = [
        createMockOption('1', 'A', 0),
        createMockOption('2', 'B', 1),
        createMockOption('3', 'C', 2),
        createMockOption('4', 'D', 3),
      ];
      const questions = [
        { id: 'q1', surveyId: 'survey-1', options },
      ] as Question[];

      mockSurveyRepository.findOne.mockResolvedValue(survey);
      mockQuestionRepository.find.mockResolvedValue(questions);

      const result = await service.getRandomizedQuestions('survey-1');

      // Same set of options (same IDs)
      const resultIds = result[0].options.map((o) => o.id).sort();
      const originalIds = options.map((o) => o.id).sort();
      expect(resultIds).toEqual(originalIds);
    });

    it('should preserve all options across multiple questions when randomized', async () => {
      const survey = { id: 'survey-1', randomizeOptions: true } as Survey;
      const q1Options = [
        createMockOption('1', 'A', 0),
        createMockOption('2', 'B', 1),
      ];
      const q2Options = [
        createMockOption('3', 'X', 0),
        createMockOption('4', 'Y', 1),
        createMockOption('5', 'Z', 2),
      ];
      const questions = [
        { id: 'q1', surveyId: 'survey-1', options: q1Options },
        { id: 'q2', surveyId: 'survey-1', options: q2Options },
      ] as Question[];

      mockSurveyRepository.findOne.mockResolvedValue(survey);
      mockQuestionRepository.find.mockResolvedValue(questions);

      const result = await service.getRandomizedQuestions('survey-1');

      expect(result[0].options.map((o) => o.id).sort()).toEqual(['1', '2']);
      expect(result[1].options.map((o) => o.id).sort()).toEqual(['3', '4', '5']);
    });
  });
});
