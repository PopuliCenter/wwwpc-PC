import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BranchingRule } from '../entities/branching-rule.entity';
import { SurveyPage } from '../entities/survey-page.entity';
import { evaluateCondition, ConditionOperator } from './condition-evaluator';
import { BranchingRuleDto } from '../dto/set-branching.dto';

@Injectable()
export class BranchingService {
  private readonly logger = new Logger(BranchingService.name);

  constructor(
    @InjectRepository(BranchingRule)
    private readonly branchingRepository: Repository<BranchingRule>,
    @InjectRepository(SurveyPage)
    private readonly pageRepository: Repository<SurveyPage>,
  ) {}

  /**
   * Set branching rules for a page. Replaces all existing rules.
   */
  async setBranchingRules(pageId: string, rules: BranchingRuleDto[]): Promise<BranchingRule[]> {
    // Verify page exists
    const page = await this.pageRepository.findOne({
      where: { id: pageId },
    });
    if (!page) {
      throw new NotFoundException(`Page with id ${pageId} not found`);
    }

    // Remove existing rules for this page
    await this.branchingRepository.delete({ pageId });

    // Create new rules
    const entities = rules.map((rule) =>
      this.branchingRepository.create({
        pageId,
        sourceQuestionId: rule.sourceQuestionId,
        conditionOperator: rule.operator,
        conditionValue: rule.conditionValue,
        targetPageId: rule.targetPageId,
      }),
    );

    const saved = await this.branchingRepository.save(entities);
    this.logger.log(`Branching rules set for page ${pageId}: ${saved.length} rules`);
    return saved;
  }

  /**
   * Evaluate page branching for a given page and answers.
   * Returns the target page ID if a branching condition is met,
   * or null for next sequential page.
   * Rules are evaluated in order; first matching rule wins.
   */
  async evaluatePageBranching(
    pageId: string,
    answers: Record<string, string | number | string[]>,
  ): Promise<string | null> {
    // Verify page exists
    const page = await this.pageRepository.findOne({
      where: { id: pageId },
    });
    if (!page) {
      throw new NotFoundException(`Page with id ${pageId} not found`);
    }

    // Get branching rules for this page
    const rules = await this.branchingRepository.find({
      where: { pageId },
    });

    for (const rule of rules) {
      const actualValue = answers[rule.sourceQuestionId];
      const conditionMet = evaluateCondition(
        rule.conditionOperator as ConditionOperator,
        rule.conditionValue,
        actualValue,
      );

      if (conditionMet) {
        return rule.targetPageId;
      }
    }

    // No branching condition met, proceed to next sequential page
    return null;
  }
}
