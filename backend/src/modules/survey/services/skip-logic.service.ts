import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SkipLogicRule } from '../entities/skip-logic-rule.entity';
import { Question } from '../entities/question.entity';
import { evaluateCondition, ConditionOperator } from './condition-evaluator';
import { SkipLogicRuleDto } from '../dto/set-skip-logic.dto';

@Injectable()
export class SkipLogicService {
  private readonly logger = new Logger(SkipLogicService.name);

  constructor(
    @InjectRepository(SkipLogicRule)
    private readonly skipLogicRepository: Repository<SkipLogicRule>,
    @InjectRepository(Question)
    private readonly questionRepository: Repository<Question>,
  ) {}

  /**
   * Set skip logic rules for a question. Replaces all existing rules.
   */
  async setSkipLogicRules(
    questionId: string,
    rules: SkipLogicRuleDto[],
  ): Promise<SkipLogicRule[]> {
    // Verify question exists
    const question = await this.questionRepository.findOne({
      where: { id: questionId },
    });
    if (!question) {
      throw new NotFoundException(`Question with id ${questionId} not found`);
    }

    // Remove existing rules for this question
    await this.skipLogicRepository.delete({ questionId });

    // Create new rules
    const entities = rules.map((rule) =>
      this.skipLogicRepository.create({
        questionId,
        sourceQuestionId: rule.sourceQuestionId,
        conditionOperator: rule.operator,
        conditionValue: rule.conditionValue,
        action: rule.action,
        targetQuestionId: rule.targetQuestionId ?? null,
      }),
    );

    const saved = await this.skipLogicRepository.save(entities);
    this.logger.log(
      `Skip logic rules set for question ${questionId}: ${saved.length} rules`,
    );
    return saved;
  }

  /**
   * Evaluate skip logic for a survey given current answers.
   * Returns a list of question IDs that should be skipped.
   */
  async evaluateSkipLogic(
    surveyId: string,
    answers: Record<string, string | number | string[]>,
  ): Promise<string[]> {
    // Get all skip logic rules for questions in this survey
    const rules = await this.skipLogicRepository
      .createQueryBuilder('rule')
      .innerJoin('rule.question', 'question')
      .where('question.survey_id = :surveyId', { surveyId })
      .getMany();

    const questionsToSkip = new Set<string>();

    for (const rule of rules) {
      const actualValue = answers[rule.sourceQuestionId];
      const conditionMet = evaluateCondition(
        rule.conditionOperator as ConditionOperator,
        rule.conditionValue,
        actualValue,
      );

      if (conditionMet) {
        if (rule.action === 'skip') {
          // Skip the question that has this rule
          questionsToSkip.add(rule.questionId);
        } else if (rule.action === 'jump_to' && rule.targetQuestionId) {
          // Skip all questions between current and target
          // The question with the rule itself gets skipped
          questionsToSkip.add(rule.questionId);
        }
      }
    }

    return Array.from(questionsToSkip);
  }
}
