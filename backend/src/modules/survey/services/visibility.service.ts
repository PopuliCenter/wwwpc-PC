import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { VisibilityRule } from '../entities/visibility-rule.entity';
import { Question } from '../entities/question.entity';
import { evaluateCondition, ConditionOperator } from './condition-evaluator';
import { VisibilityRuleDto } from '../dto/set-visibility.dto';

@Injectable()
export class VisibilityService {
  private readonly logger = new Logger(VisibilityService.name);

  constructor(
    @InjectRepository(VisibilityRule)
    private readonly visibilityRepository: Repository<VisibilityRule>,
    @InjectRepository(Question)
    private readonly questionRepository: Repository<Question>,
  ) {}

  /**
   * Set visibility rules for a question. Replaces all existing rules.
   */
  async setVisibilityRules(
    questionId: string,
    rules: VisibilityRuleDto[],
  ): Promise<VisibilityRule[]> {
    // Verify question exists
    const question = await this.questionRepository.findOne({
      where: { id: questionId },
    });
    if (!question) {
      throw new NotFoundException(`Question with id ${questionId} not found`);
    }

    // Remove existing rules for this question
    await this.visibilityRepository.delete({ questionId });

    // Create new rules
    const entities = rules.map((rule) =>
      this.visibilityRepository.create({
        questionId,
        sourceQuestionId: rule.sourceQuestionId,
        conditionOperator: rule.operator,
        conditionValue: rule.conditionValue,
        visibilityAction: rule.visibilityAction,
      }),
    );

    const saved = await this.visibilityRepository.save(entities);
    this.logger.log(`Visibility rules set for question ${questionId}: ${saved.length} rules`);
    return saved;
  }

  /**
   * Evaluate visibility for a survey given current answers.
   * Returns a map of questionId -> visible (true) or hidden (false).
   * Questions without visibility rules are considered visible by default.
   */
  async evaluateVisibility(
    surveyId: string,
    answers: Record<string, string | number | string[]>,
  ): Promise<Record<string, boolean>> {
    // Get all visibility rules for questions in this survey
    const rules = await this.visibilityRepository
      .createQueryBuilder('rule')
      .innerJoin('rule.question', 'question')
      .where('question.survey_id = :surveyId', { surveyId })
      .getMany();

    // Kelompokkan aturan per pertanyaan agar hasil DETERMINISTIK (tak bergantung
    // urutan baris) dan MENIRU PERSIS klien (surveyBranching.isQuestionVisible):
    //   tampil  = tak ada aturan show ATAU SEMUA aturan show terpenuhi (AND / .every)
    //   sembunyi= SALAH SATU aturan hide terpenuhi (hide menang atas show)
    //   visible = tampil && !sembunyi
    // Sebelumnya server memakai OR untuk show & bisa tertimpa urutan baris,
    // sehingga pertanyaan cabang eksperimen (arm) bisa dianggap wajib di server
    // padahal klien menyembunyikannya → submit ditolak "wajib diisi".
    const grouped = new Map<string, { show: typeof rules; hide: typeof rules }>();
    for (const rule of rules) {
      const g = grouped.get(rule.questionId) ?? { show: [], hide: [] };
      (rule.visibilityAction === 'hide' ? g.hide : g.show).push(rule);
      grouped.set(rule.questionId, g);
    }

    const met = (rule: (typeof rules)[number]): boolean =>
      evaluateCondition(
        rule.conditionOperator as ConditionOperator,
        rule.conditionValue,
        answers[rule.sourceQuestionId],
      );

    const visibilityMap: Record<string, boolean> = {};
    for (const [questionId, g] of grouped) {
      const shown = g.show.length === 0 || g.show.every(met);
      const hidden = g.hide.some(met);
      visibilityMap[questionId] = shown && !hidden;
    }

    return visibilityMap;
  }
}
