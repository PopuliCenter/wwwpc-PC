import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { SkipLogicService } from './skip-logic.service';
import { SkipLogicRule } from '../entities/skip-logic-rule.entity';
import { Question } from '../entities/question.entity';
import { NotFoundException } from '@nestjs/common';

describe('SkipLogicService', () => {
  let service: SkipLogicService;
  let skipLogicRepository: any;
  let questionRepository: any;

  beforeEach(async () => {
    skipLogicRepository = {
      delete: vi.fn(),
      create: vi.fn((data) => ({ ...data, id: 'rule-id' })),
      save: vi.fn((entities) =>
        Array.isArray(entities)
          ? entities.map((e, i) => ({ ...e, id: `rule-${i}` }))
          : { ...entities, id: 'rule-id' },
      ),
      find: vi.fn().mockResolvedValue([]),
      createQueryBuilder: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        getMany: vi.fn().mockResolvedValue([]),
      }),
    };

    questionRepository = {
      findOne: vi.fn().mockResolvedValue({ id: 'q1', surveyId: 'survey-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SkipLogicService,
        {
          provide: getRepositoryToken(SkipLogicRule),
          useValue: skipLogicRepository,
        },
        {
          provide: getRepositoryToken(Question),
          useValue: questionRepository,
        },
      ],
    }).compile();

    service = module.get<SkipLogicService>(SkipLogicService);
  });

  describe('setSkipLogicRules', () => {
    it('should throw NotFoundException if question does not exist', async () => {
      questionRepository.findOne.mockResolvedValue(null);

      await expect(service.setSkipLogicRules('non-existent', [])).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should delete existing rules and create new ones', async () => {
      const rules = [
        {
          sourceQuestionId: 'q-source',
          operator: 'equals',
          conditionValue: 'yes',
          action: 'skip' as const,
          targetQuestionId: undefined,
        },
      ];

      const result = await service.setSkipLogicRules('q1', rules);

      expect(skipLogicRepository.delete).toHaveBeenCalledWith({
        questionId: 'q1',
      });
      expect(skipLogicRepository.create).toHaveBeenCalledWith({
        questionId: 'q1',
        sourceQuestionId: 'q-source',
        conditionOperator: 'equals',
        conditionValue: 'yes',
        action: 'skip',
        targetQuestionId: null,
      });
      expect(skipLogicRepository.save).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });
  });

  describe('evaluateSkipLogic', () => {
    it('should return empty array when no rules exist', async () => {
      const result = await service.evaluateSkipLogic('survey-1', {
        q1: 'yes',
      });
      expect(result).toEqual([]);
    });

    it('should return question IDs to skip when conditions are met', async () => {
      const mockRules = [
        {
          id: 'rule-1',
          questionId: 'q2',
          sourceQuestionId: 'q1',
          conditionOperator: 'equals',
          conditionValue: 'yes',
          action: 'skip',
          targetQuestionId: null,
        },
      ];

      skipLogicRepository.createQueryBuilder.mockReturnValue({
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        getMany: vi.fn().mockResolvedValue(mockRules),
      });

      const result = await service.evaluateSkipLogic('survey-1', {
        q1: 'yes',
      });

      expect(result).toContain('q2');
    });

    it('should not skip questions when conditions are not met', async () => {
      const mockRules = [
        {
          id: 'rule-1',
          questionId: 'q2',
          sourceQuestionId: 'q1',
          conditionOperator: 'equals',
          conditionValue: 'yes',
          action: 'skip',
          targetQuestionId: null,
        },
      ];

      skipLogicRepository.createQueryBuilder.mockReturnValue({
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        getMany: vi.fn().mockResolvedValue(mockRules),
      });

      const result = await service.evaluateSkipLogic('survey-1', {
        q1: 'no',
      });

      expect(result).toEqual([]);
    });

    it('should handle jump_to action', async () => {
      const mockRules = [
        {
          id: 'rule-1',
          questionId: 'q2',
          sourceQuestionId: 'q1',
          conditionOperator: 'equals',
          conditionValue: 'skip_ahead',
          action: 'jump_to',
          targetQuestionId: 'q5',
        },
      ];

      skipLogicRepository.createQueryBuilder.mockReturnValue({
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        getMany: vi.fn().mockResolvedValue(mockRules),
      });

      const result = await service.evaluateSkipLogic('survey-1', {
        q1: 'skip_ahead',
      });

      expect(result).toContain('q2');
    });
  });
});
