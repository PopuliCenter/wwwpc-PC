import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BranchingService } from './branching.service';
import { BranchingRule } from '../entities/branching-rule.entity';
import { SurveyPage } from '../entities/survey-page.entity';
import { NotFoundException } from '@nestjs/common';

describe('BranchingService', () => {
  let service: BranchingService;
  let branchingRepository: any;
  let pageRepository: any;

  beforeEach(async () => {
    branchingRepository = {
      delete: vi.fn(),
      create: vi.fn((data) => ({ ...data, id: 'rule-id' })),
      save: vi.fn((entities) =>
        Array.isArray(entities)
          ? entities.map((e, i) => ({ ...e, id: `rule-${i}` }))
          : { ...entities, id: 'rule-id' },
      ),
      find: vi.fn().mockResolvedValue([]),
    };

    pageRepository = {
      findOne: vi.fn().mockResolvedValue({ id: 'page-1', surveyId: 'survey-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BranchingService,
        {
          provide: getRepositoryToken(BranchingRule),
          useValue: branchingRepository,
        },
        {
          provide: getRepositoryToken(SurveyPage),
          useValue: pageRepository,
        },
      ],
    }).compile();

    service = module.get<BranchingService>(BranchingService);
  });

  describe('setBranchingRules', () => {
    it('should throw NotFoundException if page does not exist', async () => {
      pageRepository.findOne.mockResolvedValue(null);

      await expect(
        service.setBranchingRules('non-existent', []),
      ).rejects.toThrow(NotFoundException);
    });

    it('should delete existing rules and create new ones', async () => {
      const rules = [
        {
          sourceQuestionId: 'q-source',
          operator: 'equals',
          conditionValue: 'option_a',
          targetPageId: 'page-3',
        },
      ];

      const result = await service.setBranchingRules('page-1', rules);

      expect(branchingRepository.delete).toHaveBeenCalledWith({
        pageId: 'page-1',
      });
      expect(branchingRepository.create).toHaveBeenCalledWith({
        pageId: 'page-1',
        sourceQuestionId: 'q-source',
        conditionOperator: 'equals',
        conditionValue: 'option_a',
        targetPageId: 'page-3',
      });
      expect(branchingRepository.save).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });
  });

  describe('evaluatePageBranching', () => {
    it('should throw NotFoundException if page does not exist', async () => {
      pageRepository.findOne.mockResolvedValue(null);

      await expect(
        service.evaluatePageBranching('non-existent', {}),
      ).rejects.toThrow(NotFoundException);
    });

    it('should return null when no rules exist', async () => {
      const result = await service.evaluatePageBranching('page-1', {
        q1: 'yes',
      });
      expect(result).toBeNull();
    });

    it('should return target page ID when condition is met', async () => {
      branchingRepository.find.mockResolvedValue([
        {
          id: 'rule-1',
          pageId: 'page-1',
          sourceQuestionId: 'q1',
          conditionOperator: 'equals',
          conditionValue: 'option_a',
          targetPageId: 'page-3',
        },
      ]);

      const result = await service.evaluatePageBranching('page-1', {
        q1: 'option_a',
      });

      expect(result).toBe('page-3');
    });

    it('should return null when no condition is met', async () => {
      branchingRepository.find.mockResolvedValue([
        {
          id: 'rule-1',
          pageId: 'page-1',
          sourceQuestionId: 'q1',
          conditionOperator: 'equals',
          conditionValue: 'option_a',
          targetPageId: 'page-3',
        },
      ]);

      const result = await service.evaluatePageBranching('page-1', {
        q1: 'option_b',
      });

      expect(result).toBeNull();
    });

    it('should return first matching rule target (first wins)', async () => {
      branchingRepository.find.mockResolvedValue([
        {
          id: 'rule-1',
          pageId: 'page-1',
          sourceQuestionId: 'q1',
          conditionOperator: 'equals',
          conditionValue: 'option_a',
          targetPageId: 'page-3',
        },
        {
          id: 'rule-2',
          pageId: 'page-1',
          sourceQuestionId: 'q1',
          conditionOperator: 'contains',
          conditionValue: 'option',
          targetPageId: 'page-4',
        },
      ]);

      const result = await service.evaluatePageBranching('page-1', {
        q1: 'option_a',
      });

      expect(result).toBe('page-3');
    });

    it('should handle greater_than operator for numeric branching', async () => {
      branchingRepository.find.mockResolvedValue([
        {
          id: 'rule-1',
          pageId: 'page-1',
          sourceQuestionId: 'q1',
          conditionOperator: 'greater_than',
          conditionValue: '5',
          targetPageId: 'page-high',
        },
      ]);

      const result = await service.evaluatePageBranching('page-1', {
        q1: 8,
      });

      expect(result).toBe('page-high');
    });
  });
});
