import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { VisibilityService } from './visibility.service';
import { VisibilityRule } from '../entities/visibility-rule.entity';
import { Question } from '../entities/question.entity';
import { NotFoundException } from '@nestjs/common';

describe('VisibilityService', () => {
  let service: VisibilityService;
  let visibilityRepository: any;
  let questionRepository: any;

  beforeEach(async () => {
    visibilityRepository = {
      delete: vi.fn(),
      create: vi.fn((data) => ({ ...data, id: 'rule-id' })),
      save: vi.fn((entities) =>
        Array.isArray(entities)
          ? entities.map((e, i) => ({ ...e, id: `rule-${i}` }))
          : { ...entities, id: 'rule-id' },
      ),
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
        VisibilityService,
        {
          provide: getRepositoryToken(VisibilityRule),
          useValue: visibilityRepository,
        },
        {
          provide: getRepositoryToken(Question),
          useValue: questionRepository,
        },
      ],
    }).compile();

    service = module.get<VisibilityService>(VisibilityService);
  });

  describe('setVisibilityRules', () => {
    it('should throw NotFoundException if question does not exist', async () => {
      questionRepository.findOne.mockResolvedValue(null);

      await expect(service.setVisibilityRules('non-existent', [])).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should delete existing rules and create new ones', async () => {
      const rules = [
        {
          sourceQuestionId: 'q-source',
          operator: 'equals',
          conditionValue: 'yes',
          visibilityAction: 'show' as const,
        },
      ];

      const result = await service.setVisibilityRules('q1', rules);

      expect(visibilityRepository.delete).toHaveBeenCalledWith({
        questionId: 'q1',
      });
      expect(visibilityRepository.create).toHaveBeenCalledWith({
        questionId: 'q1',
        sourceQuestionId: 'q-source',
        conditionOperator: 'equals',
        conditionValue: 'yes',
        visibilityAction: 'show',
      });
      expect(visibilityRepository.save).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });
  });

  describe('evaluateVisibility', () => {
    it('should return empty map when no rules exist', async () => {
      const result = await service.evaluateVisibility('survey-1', {
        q1: 'yes',
      });
      expect(result).toEqual({});
    });

    it('should show question when show condition is met', async () => {
      const mockRules = [
        {
          id: 'rule-1',
          questionId: 'q2',
          sourceQuestionId: 'q1',
          conditionOperator: 'equals',
          conditionValue: 'yes',
          visibilityAction: 'show',
        },
      ];

      visibilityRepository.createQueryBuilder.mockReturnValue({
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        getMany: vi.fn().mockResolvedValue(mockRules),
      });

      const result = await service.evaluateVisibility('survey-1', {
        q1: 'yes',
      });

      expect(result['q2']).toBe(true);
    });

    it('should hide question when show condition is not met', async () => {
      const mockRules = [
        {
          id: 'rule-1',
          questionId: 'q2',
          sourceQuestionId: 'q1',
          conditionOperator: 'equals',
          conditionValue: 'yes',
          visibilityAction: 'show',
        },
      ];

      visibilityRepository.createQueryBuilder.mockReturnValue({
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        getMany: vi.fn().mockResolvedValue(mockRules),
      });

      const result = await service.evaluateVisibility('survey-1', {
        q1: 'no',
      });

      expect(result['q2']).toBe(false);
    });

    it('should hide question when hide condition is met', async () => {
      const mockRules = [
        {
          id: 'rule-1',
          questionId: 'q2',
          sourceQuestionId: 'q1',
          conditionOperator: 'equals',
          conditionValue: 'yes',
          visibilityAction: 'hide',
        },
      ];

      visibilityRepository.createQueryBuilder.mockReturnValue({
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        getMany: vi.fn().mockResolvedValue(mockRules),
      });

      const result = await service.evaluateVisibility('survey-1', {
        q1: 'yes',
      });

      expect(result['q2']).toBe(false);
    });

    it('should show question when hide condition is not met', async () => {
      const mockRules = [
        {
          id: 'rule-1',
          questionId: 'q2',
          sourceQuestionId: 'q1',
          conditionOperator: 'equals',
          conditionValue: 'yes',
          visibilityAction: 'hide',
        },
      ];

      visibilityRepository.createQueryBuilder.mockReturnValue({
        innerJoin: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        getMany: vi.fn().mockResolvedValue(mockRules),
      });

      const result = await service.evaluateVisibility('survey-1', {
        q1: 'no',
      });

      expect(result['q2']).toBe(true);
    });

    // Konsistensi dgn klien (isQuestionVisible): show di-AND, hide menang.
    const mockQb = (rules: any[]) => ({
      innerJoin: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnThis(),
      getMany: vi.fn().mockResolvedValue(rules),
    });

    it('MULTI show: tampil hanya bila SEMUA aturan show terpenuhi (AND)', async () => {
      const rules = [
        {
          questionId: 'q3',
          sourceQuestionId: 'arm',
          conditionOperator: 'equals',
          conditionValue: 'gender',
          visibilityAction: 'show',
        },
        {
          questionId: 'q3',
          sourceQuestionId: 'qk',
          conditionOperator: 'equals',
          conditionValue: 'ya',
          visibilityAction: 'show',
        },
      ];
      visibilityRepository.createQueryBuilder.mockReturnValue(mockQb(rules));

      // arm cocok tapi qk TIDAK → dulu (OR) server keliru menampilkan; kini false.
      expect((await service.evaluateVisibility('s', { arm: 'gender', qk: 'tidak' }))['q3']).toBe(
        false,
      );
      // keduanya cocok → tampil.
      expect((await service.evaluateVisibility('s', { arm: 'gender', qk: 'ya' }))['q3']).toBe(true);
    });

    it('show + hide: hide MENANG (deterministik)', async () => {
      const rules = [
        {
          questionId: 'q4',
          sourceQuestionId: 'arm',
          conditionOperator: 'equals',
          conditionValue: 'gender',
          visibilityAction: 'show',
        },
        {
          questionId: 'q4',
          sourceQuestionId: 'stop',
          conditionOperator: 'equals',
          conditionValue: 'x',
          visibilityAction: 'hide',
        },
      ];
      visibilityRepository.createQueryBuilder.mockReturnValue(mockQb(rules));

      expect((await service.evaluateVisibility('s', { arm: 'gender', stop: 'x' }))['q4']).toBe(
        false,
      );
      expect((await service.evaluateVisibility('s', { arm: 'gender', stop: '-' }))['q4']).toBe(
        true,
      );
    });
  });
});
