import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import { Question } from './entities/question.entity';
import { QuestionOption } from './entities/question-option.entity';
import { Survey } from './entities/survey.entity';
import { SurveyPage } from './entities/survey-page.entity';
import { SkipLogicRule } from './entities/skip-logic-rule.entity';
import { VisibilityRule } from './entities/visibility-rule.entity';
import { SurveyResponse, ResponseStatus } from '@modules/response/entities/survey-response.entity';
import { CreateQuestionDto } from './dto/create-question.dto';
import { UpdateQuestionDto } from './dto/update-question.dto';
import { ReorderQuestionsDto } from './dto/reorder-questions.dto';
import { QuestionType } from '@shared/enums';

/** Bentuk aturan skip/visibilitas dalam payload builder (referensi pakai id-builder). */
export interface BulkSkipRuleInput {
  sourceQuestionId?: string;
  operator?: string;
  conditionValue?: string;
  action?: string;
  targetQuestionId?: string | null;
}
export interface BulkVisibilityRuleInput {
  sourceQuestionId?: string;
  operator?: string;
  conditionValue?: string;
  visibilityAction?: string;
}
export interface BulkQuestionInput {
  clientId?: string;
  type: QuestionType;
  text?: string;
  required?: boolean;
  enabled?: boolean;
  order?: number;
  hasOtherOption?: boolean;
  options?: Array<{ label?: string; value?: string; orderIndex?: number }>;
  validationRules?: Record<string, any> | null;
  skipLogicRules?: BulkSkipRuleInput[];
  visibilityRules?: BulkVisibilityRuleInput[];
}

@Injectable()
export class QuestionService {
  private readonly logger = new Logger(QuestionService.name);

  constructor(
    @InjectRepository(Question)
    private readonly questionRepository: Repository<Question>,
    @InjectRepository(QuestionOption)
    private readonly optionRepository: Repository<QuestionOption>,
    @InjectRepository(Survey)
    private readonly surveyRepository: Repository<Survey>,
    @InjectRepository(SurveyPage)
    private readonly pageRepository: Repository<SurveyPage>,
    @InjectRepository(SkipLogicRule)
    private readonly skipLogicRepository: Repository<SkipLogicRule>,
    @InjectRepository(VisibilityRule)
    private readonly visibilityRepository: Repository<VisibilityRule>,
    @InjectRepository(SurveyResponse)
    private readonly responseRepository: Repository<SurveyResponse>,
  ) {}

  async addQuestion(surveyId: string, dto: CreateQuestionDto): Promise<Question> {
    // Verify survey exists
    const survey = await this.surveyRepository.findOne({
      where: { id: surveyId },
    });
    if (!survey) {
      throw new NotFoundException(`Survey with id ${surveyId} not found`);
    }

    // Verify page exists and belongs to survey
    const page = await this.pageRepository.findOne({
      where: { id: dto.pageId, surveyId },
    });
    if (!page) {
      throw new NotFoundException(`Page with id ${dto.pageId} not found in survey ${surveyId}`);
    }

    // Validate has_other_option only for choice-based questions
    if (dto.hasOtherOption) {
      this.validateOtherOptionSupport(dto.type);
    }

    // Validate options are provided for choice-based questions
    this.validateOptionsForType(dto.type, dto.options);

    // Validate validation rules for the question type
    if (dto.validationRules) {
      this.validateRulesForType(dto.type, dto.validationRules);
    }

    // Determine order_index
    let orderIndex = dto.order ?? 0;
    if (dto.order === undefined) {
      const maxOrder = await this.questionRepository
        .createQueryBuilder('q')
        .select('MAX(q.order_index)', 'max')
        .where('q.survey_id = :surveyId', { surveyId })
        .getRawOne();
      orderIndex = (maxOrder?.max ?? -1) + 1;
    }

    // Create question
    const question = this.questionRepository.create({
      surveyId,
      pageId: dto.pageId,
      type: dto.type,
      questionText: dto.text,
      required: dto.required ?? false,
      orderIndex,
      validationRules: dto.validationRules ?? null,
      hasOtherOption: dto.hasOtherOption ?? false,
    });

    const savedQuestion = await this.questionRepository.save(question);

    // Create options if provided
    if (dto.options && dto.options.length > 0) {
      const options = dto.options.map((opt, index) =>
        this.optionRepository.create({
          questionId: savedQuestion.id,
          label: opt.label,
          value: opt.value,
          orderIndex: opt.orderIndex ?? index,
        }),
      );
      await this.optionRepository.save(options);
    }

    this.logger.log(`Question created: ${savedQuestion.id} for survey ${surveyId}`);

    return this.findById(savedQuestion.id);
  }

  /**
   * Ganti SELURUH pertanyaan survei sekaligus (dipakai builder "Simpan").
   * Bersifat lunak: teks/opsi boleh kosong (draft). Hapus semua lalu buat ulang.
   */
  async bulkReplaceQuestions(
    surveyId: string,
    questions: BulkQuestionInput[],
  ): Promise<Question[]> {
    const survey = await this.surveyRepository.findOne({ where: { id: surveyId } });
    if (!survey) {
      throw new NotFoundException(`Survey with id ${surveyId} not found`);
    }

    // GERBANG ANTI KEHILANGAN DATA: bulkReplace menghapus semua pertanyaan lalu
    // membuat ulang dengan UUID baru; FK answer→question ber-ON DELETE CASCADE,
    // sehingga mengganti pertanyaan pada survei yang sudah punya respons SELESAI
    // akan menghapus permanen seluruh jawaban responden. Tolak dengan pesan jelas
    // — admin harus menduplikasi survei untuk mengubah kuesioner setelah ada data.
    const completedResponses = await this.responseRepository.count({
      where: { surveyId, status: ResponseStatus.COMPLETE, archivedAt: IsNull() },
    });
    if (completedResponses > 0) {
      throw new ConflictException(
        `Survei ini sudah memiliki ${completedResponses} respons selesai. Mengubah pertanyaan akan ` +
          `menghapus jawaban yang sudah terkumpul. Duplikat survei ini untuk membuat versi baru, ` +
          `atau arsipkan responsnya terlebih dulu bila memang ingin memulai ulang pengumpulan data.`,
      );
    }

    // Pastikan ada minimal satu halaman (model question butuh page_id)
    let page = await this.pageRepository.findOne({
      where: { surveyId },
      order: { orderIndex: 'ASC' },
    });
    if (!page) {
      page = await this.pageRepository.save(
        this.pageRepository.create({ surveyId, pageNumber: 1, orderIndex: 0, title: null }),
      );
    }

    // Hapus semua pertanyaan lama (cascade menghapus opsi + aturan skip/visibilitas
    // lewat FK ON DELETE CASCADE pada question_id).
    const existing = await this.questionRepository.find({ where: { surveyId } });
    if (existing.length > 0) {
      await this.questionRepository.remove(existing);
    }

    // Pass 1: buat ulang pertanyaan + opsi, dan bangun peta id-builder → id-DB-baru
    // (pertanyaan dibuat ulang dengan UUID baru tiap simpan, jadi referensi aturan
    // harus dipetakan ulang agar skip/visibilitas tetap berjalan).
    const idMap = new Map<string, string>();
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const saved = await this.questionRepository.save(
        this.questionRepository.create({
          surveyId,
          pageId: page.id,
          type: q.type,
          questionText: q.text ?? '',
          required: q.required ?? false,
          enabled: q.enabled ?? true,
          orderIndex: q.order ?? i,
          validationRules: q.validationRules ?? null,
          hasOtherOption: q.hasOtherOption ?? false,
        }),
      );
      if (q.clientId) idMap.set(q.clientId, saved.id);
      // Selalu petakan dari id lama juga (untuk duplikasi yang memakai id asli).
      idMap.set(saved.id, saved.id);

      if (q.options && q.options.length > 0) {
        const options = q.options.map((opt, idx) =>
          this.optionRepository.create({
            questionId: saved.id,
            label: opt.label ?? '',
            value: opt.value || opt.label || `option_${idx + 1}`,
            orderIndex: opt.orderIndex ?? idx,
          }),
        );
        await this.optionRepository.save(options);
      }
    }

    // Pass 2: buat aturan skip/visibilitas dengan referensi yang sudah dipetakan.
    // Aturan tak lengkap / referensi yang tak ada diabaikan (draft-friendly).
    await this.persistLogicRules(questions, idMap);

    this.logger.log(`Bulk replaced ${questions.length} questions for survey ${surveyId}`);
    return this.getQuestionsBySurvey(surveyId);
  }

  /** Tulis aturan skip & visibilitas, memetakan id-builder → id-DB via idMap. */
  private async persistLogicRules(
    questions: BulkQuestionInput[],
    idMap: Map<string, string>,
  ): Promise<void> {
    const skipRows: SkipLogicRule[] = [];
    const visRows: VisibilityRule[] = [];

    for (const q of questions) {
      const questionId = q.clientId ? idMap.get(q.clientId) : undefined;
      if (!questionId) continue;

      for (const r of q.skipLogicRules ?? []) {
        const source = r.sourceQuestionId ? idMap.get(r.sourceQuestionId) : undefined;
        if (!source || !r.operator) continue;
        const action = r.action === 'jump_to' ? 'jump_to' : 'skip';
        const target =
          action === 'jump_to' && r.targetQuestionId
            ? (idMap.get(r.targetQuestionId) ?? null)
            : null;
        skipRows.push(
          this.skipLogicRepository.create({
            questionId,
            sourceQuestionId: source,
            conditionOperator: r.operator,
            conditionValue: r.conditionValue ?? '',
            action,
            targetQuestionId: target,
          }),
        );
      }

      for (const r of q.visibilityRules ?? []) {
        const source = r.sourceQuestionId ? idMap.get(r.sourceQuestionId) : undefined;
        if (!source || !r.operator) continue;
        visRows.push(
          this.visibilityRepository.create({
            questionId,
            sourceQuestionId: source,
            conditionOperator: r.operator,
            conditionValue: r.conditionValue ?? '',
            visibilityAction: r.visibilityAction === 'hide' ? 'hide' : 'show',
          }),
        );
      }
    }

    if (skipRows.length > 0) await this.skipLogicRepository.save(skipRows);
    if (visRows.length > 0) await this.visibilityRepository.save(visRows);
  }

  /** Aturan skip/visibilitas satu survei (dipakai saat duplikasi survei). */
  async getSurveyLogicRules(
    surveyId: string,
  ): Promise<{ skip: SkipLogicRule[]; visibility: VisibilityRule[] }> {
    const ids = (
      await this.questionRepository.find({ where: { surveyId }, select: { id: true } })
    ).map((q) => q.id);
    if (ids.length === 0) return { skip: [], visibility: [] };
    const [skip, visibility] = await Promise.all([
      this.skipLogicRepository.find({ where: { questionId: In(ids) } }),
      this.visibilityRepository.find({ where: { questionId: In(ids) } }),
    ]);
    return { skip, visibility };
  }

  async updateQuestion(questionId: string, dto: UpdateQuestionDto): Promise<Question> {
    const question = await this.findById(questionId);

    // Update basic fields
    if (dto.type !== undefined) question.type = dto.type;
    if (dto.text !== undefined) question.questionText = dto.text;
    if (dto.required !== undefined) question.required = dto.required;
    if (dto.pageId !== undefined) {
      // Verify page exists and belongs to same survey
      const page = await this.pageRepository.findOne({
        where: { id: dto.pageId, surveyId: question.surveyId },
      });
      if (!page) {
        throw new NotFoundException(
          `Page with id ${dto.pageId} not found in survey ${question.surveyId}`,
        );
      }
      question.pageId = dto.pageId;
    }
    if (dto.order !== undefined) question.orderIndex = dto.order;
    if (dto.validationRules !== undefined) {
      if (dto.validationRules) {
        this.validateRulesForType(dto.type ?? question.type, dto.validationRules);
      }
      question.validationRules = dto.validationRules ?? null;
    }
    if (dto.hasOtherOption !== undefined) {
      if (dto.hasOtherOption) {
        this.validateOtherOptionSupport(dto.type ?? question.type);
      }
      question.hasOtherOption = dto.hasOtherOption;
    }

    await this.questionRepository.save(question);

    // Update options if provided
    if (dto.options !== undefined) {
      // Remove existing options
      await this.optionRepository.delete({ questionId });

      // Create new options
      if (dto.options.length > 0) {
        const options = dto.options.map((opt, index) =>
          this.optionRepository.create({
            questionId,
            label: opt.label,
            value: opt.value,
            orderIndex: opt.orderIndex ?? index,
          }),
        );
        await this.optionRepository.save(options);
      }
    }

    this.logger.log(`Question updated: ${questionId}`);

    return this.findById(questionId);
  }

  async deleteQuestion(questionId: string): Promise<void> {
    const question = await this.findById(questionId);
    const surveyId = question.surveyId;
    const deletedOrder = question.orderIndex;

    await this.questionRepository.remove(question);

    // Reorder remaining questions
    await this.questionRepository
      .createQueryBuilder()
      .update(Question)
      .set({ orderIndex: () => 'order_index - 1' })
      .where('survey_id = :surveyId', { surveyId })
      .andWhere('order_index > :deletedOrder', { deletedOrder })
      .execute();

    this.logger.log(`Question deleted: ${questionId}`);
  }

  async reorderQuestions(surveyId: string, dto: ReorderQuestionsDto): Promise<void> {
    // Verify survey exists
    const survey = await this.surveyRepository.findOne({
      where: { id: surveyId },
    });
    if (!survey) {
      throw new NotFoundException(`Survey with id ${surveyId} not found`);
    }

    // Verify all question IDs belong to this survey
    const questions = await this.questionRepository.find({
      where: { surveyId },
    });
    const existingIds = new Set(questions.map((q) => q.id));

    for (const qId of dto.questionIds) {
      if (!existingIds.has(qId)) {
        throw new BadRequestException(`Question ${qId} does not belong to survey ${surveyId}`);
      }
    }

    // Update order_index for each question
    const updates = dto.questionIds.map((id, index) =>
      this.questionRepository.update(id, { orderIndex: index }),
    );
    await Promise.all(updates);

    this.logger.log(`Questions reordered for survey ${surveyId}`);
  }

  async getQuestionsBySurvey(surveyId: string): Promise<Question[]> {
    // Verify survey exists
    const survey = await this.surveyRepository.findOne({
      where: { id: surveyId },
    });
    if (!survey) {
      throw new NotFoundException(`Survey with id ${surveyId} not found`);
    }

    const questions = await this.questionRepository.find({
      where: { surveyId },
      relations: ['options'],
      order: { orderIndex: 'ASC' },
    });

    // Sertakan aturan skip & visibilitas agar builder bisa memuatnya kembali
    // (tanpa ini, logika tampak hilang tiap kali survei dibuka untuk diedit).
    const ids = questions.map((q) => q.id);
    const [skip, visibility] = await Promise.all([
      ids.length ? this.skipLogicRepository.find({ where: { questionId: In(ids) } }) : [],
      ids.length ? this.visibilityRepository.find({ where: { questionId: In(ids) } }) : [],
    ]);

    return questions.map((q) => ({
      ...q,
      skipLogicRules: skip
        .filter((r) => r.questionId === q.id)
        .map((r) => ({
          sourceQuestionId: r.sourceQuestionId,
          operator: r.conditionOperator,
          conditionValue: r.conditionValue,
          action: r.action,
          targetQuestionId: r.targetQuestionId,
        })),
      visibilityRules: visibility
        .filter((r) => r.questionId === q.id)
        .map((r) => ({
          sourceQuestionId: r.sourceQuestionId,
          operator: r.conditionOperator,
          conditionValue: r.conditionValue,
          visibilityAction: r.visibilityAction,
        })),
    })) as unknown as Question[];
  }

  async findById(questionId: string): Promise<Question> {
    const question = await this.questionRepository.findOne({
      where: { id: questionId },
      relations: ['options'],
    });

    if (!question) {
      throw new NotFoundException(`Question with id ${questionId} not found`);
    }

    return question;
  }

  private validateOtherOptionSupport(type: QuestionType): void {
    const supportedTypes = [
      QuestionType.SINGLE_CHOICE,
      QuestionType.MULTIPLE_CHOICE,
      QuestionType.DROPDOWN,
    ];
    if (!supportedTypes.includes(type)) {
      throw new BadRequestException(
        `"Lainnya" (Other) option is only supported for single_choice, multiple_choice, and dropdown question types`,
      );
    }
  }

  private validateOptionsForType(
    type: QuestionType,
    options?: { label: string; value: string }[],
  ): void {
    const typesRequiringOptions = [
      QuestionType.SINGLE_CHOICE,
      QuestionType.MULTIPLE_CHOICE,
      QuestionType.DROPDOWN,
      QuestionType.MATRIX_LIKERT,
    ];

    if (typesRequiringOptions.includes(type)) {
      if (!options || options.length === 0) {
        throw new BadRequestException(`Question type "${type}" requires at least one option`);
      }
    }
  }

  private validateRulesForType(type: QuestionType, rules: Record<string, any>): void {
    // maxCheckbox only valid for multiple_choice
    if (rules.maxCheckbox !== undefined && type !== QuestionType.MULTIPLE_CHOICE) {
      throw new BadRequestException(
        `Validation rule "maxCheckbox" is only valid for multiple_choice questions`,
      );
    }

    // phoneFormat only valid for phone_number or short_text
    if (
      rules.phoneFormat &&
      type !== QuestionType.PHONE_NUMBER &&
      type !== QuestionType.SHORT_TEXT
    ) {
      throw new BadRequestException(
        `Validation rule "phoneFormat" is only valid for phone_number or short_text questions`,
      );
    }

    // emailFormat only valid for short_text
    if (rules.emailFormat && type !== QuestionType.SHORT_TEXT) {
      throw new BadRequestException(
        `Validation rule "emailFormat" is only valid for short_text questions`,
      );
    }

    // numericRange only valid for numeric_scale
    if (rules.numericRange && type !== QuestionType.NUMERIC_SCALE) {
      throw new BadRequestException(
        `Validation rule "numericRange" is only valid for numeric_scale questions`,
      );
    }

    // minLength/maxLength only valid for text types
    if (
      (rules.minLength !== undefined || rules.maxLength !== undefined) &&
      type !== QuestionType.SHORT_TEXT &&
      type !== QuestionType.LONG_TEXT
    ) {
      throw new BadRequestException(
        `Validation rules "minLength"/"maxLength" are only valid for short_text or long_text questions`,
      );
    }
  }
}
