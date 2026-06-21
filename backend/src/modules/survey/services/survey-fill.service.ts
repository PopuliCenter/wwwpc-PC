import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Survey } from '../entities/survey.entity';
import { SurveyPage } from '../entities/survey-page.entity';
import { Question } from '../entities/question.entity';
import { SkipLogicRule } from '../entities/skip-logic-rule.entity';
import { VisibilityRule } from '../entities/visibility-rule.entity';
import {
  SurveyResponse,
  ResponseStatus,
} from '@modules/response/entities/survey-response.entity';
import { Answer } from '@modules/response/entities/answer.entity';
import { QuestionType } from '@shared/enums';
import { SurveyTimeService } from './survey-time.service';
import { checkEligibility } from '../utils/eligibility';

/** A condition in the shape the respondent frontend evaluates. */
export interface FillCondition {
  /** The SOURCE question whose answer drives the condition. */
  questionId: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than';
  value: string;
}

export interface FillOption {
  id: string;
  label: string;
  value: string;
}

export interface RegionConfig {
  /** Kedalaman pilihan wilayah: province | regency | district | village */
  regionDepth?: 'province' | 'regency' | 'district' | 'village';
  /** Kunci provinsi (pre-filled, tidak bisa diubah responden) */
  lockedProvince?: { id: string; name: string } | null;
  /** Kunci kabupaten/kota (pre-filled, tidak bisa diubah responden) */
  lockedRegency?: { id: string; name: string } | null;
}

export interface RatingConfig {
  /** Jumlah rating maksimum (default 5) */
  ratingMax?: number;
  /** Mode tampilan: star = bintang, number = angka */
  ratingDisplayMode?: 'star' | 'number';
  /** Label ujung kiri (nilai terendah) */
  ratingMinLabel?: string;
  /** Label ujung kanan (nilai tertinggi) */
  ratingMaxLabel?: string;
}

export interface FillQuestion {
  id: string;
  type: string;
  text: string;
  description?: string;
  required: boolean;
  options?: FillOption[];
  matrixRows?: string[];
  matrixColumns?: string[];
  scaleMin?: number;
  scaleMax?: number;
  randomizeOptions?: boolean;
  /** Tampilkan opsi "Lainnya" (teks bebas) di bawah daftar opsi. */
  hasOtherOption?: boolean;
  skipConditions?: FillCondition[];
  visibilityConditions?: FillCondition[];
  page: number;
  /** Config khusus untuk tipe indonesia_region */
  regionConfig?: RegionConfig;
  /** Config khusus untuk tipe rating_scale */
  ratingConfig?: RatingConfig;
  /** Apakah jawaban ID unik harus di-validasi keunikannya di sisi klien (selalu di server) */
  uniqueIdConfig?: { minLength?: number; maxLength?: number };
}

export interface SurveyFillData {
  id: string;
  title: string;
  description: string;
  questions: FillQuestion[];
  totalPages: number;
  /** Mode tampilan form: paginated (default), scroll, atau wizard. */
  formMode: 'paginated' | 'scroll' | 'wizard';
  /** Rekam lokasi GPS otomatis (awal & akhir pengisian). */
  captureGps: boolean;
  /** Minta tanda tangan responden di akhir pengisian. */
  requireSignature: boolean;
  /** Jadikan jawaban teks responden HURUF BESAR (uppercase). */
  uppercaseAnswers: boolean;
  maxDuration?: number; // minutes
  rewardMode: 'auto_point' | 'manual';
  rewardPoints?: number;
  rewardDescription?: string;
  responseId: string;
  /**
   * Nilai pra-isi yang sudah ditetapkan sistem untuk responden ini — saat ini
   * berisi penugasan acak (arm eksperimen), dipetakan questionId → nilai arm.
   * Frontend menanamkannya ke peta jawaban agar aturan tampil cabang berjalan.
   */
  assignments?: Record<string, string>;
}

/**
 * Assembles everything the respondent UI needs to render and fill a survey,
 * and creates/resumes the respondent's in-progress response so that the
 * server records `started_at` (used by the timer and the min-completion-time
 * anti-fraud check).
 */
@Injectable()
export class SurveyFillService {
  private readonly logger = new Logger(SurveyFillService.name);

  constructor(
    @InjectRepository(Survey)
    private readonly surveyRepository: Repository<Survey>,
    @InjectRepository(SurveyPage)
    private readonly pageRepository: Repository<SurveyPage>,
    @InjectRepository(Question)
    private readonly questionRepository: Repository<Question>,
    @InjectRepository(SkipLogicRule)
    private readonly skipLogicRepository: Repository<SkipLogicRule>,
    @InjectRepository(VisibilityRule)
    private readonly visibilityRepository: Repository<VisibilityRule>,
    @InjectRepository(SurveyResponse)
    private readonly responseRepository: Repository<SurveyResponse>,
    @InjectRepository(Answer)
    private readonly answerRepository: Repository<Answer>,
    private readonly surveyTimeService: SurveyTimeService,
  ) {}

  async getFillData(surveyId: string, respondentId: string): Promise<SurveyFillData> {
    const survey = await this.surveyRepository.findOne({ where: { id: surveyId } });
    if (!survey) {
      throw new NotFoundException(`Survey with id ${surveyId} not found`);
    }

    // Resume any existing response. A completed one means the respondent has
    // already submitted — one response per survey.
    const existing = await this.responseRepository.findOne({
      where: { surveyId, respondentId },
    });
    if (existing && existing.status === ResponseStatus.COMPLETE) {
      throw new ConflictException(
        'Anda sudah menyelesaikan survei ini. Satu responden hanya boleh mengisi satu kali.',
      );
    }

    // Gerbang: wajib lengkapi data diri (demografi pembobot) sebelum mengisi
    // survei apa pun — berlaku untuk semua jalur login.
    await this.assertProfileCompleted(respondentId);

    // Access (time window / respondent cap) is enforced only when STARTING a
    // new response. A respondent who already has an in-progress response is
    // allowed to resume; the submit endpoint re-checks time/cap on submission.
    if (!existing) {
      await this.assertSurveyAccessible(surveyId);
      await this.assertEligible(survey, respondentId);
    }

    const responseId = await this.getOrCreateInProgressResponse(
      surveyId,
      respondentId,
      existing,
    );

    // Undi (atau muat) penugasan arm eksperimen untuk respons ini. Dilakukan
    // sebelum merakit data agar nilai arm bisa dikirim ke frontend sebagai
    // pra-isi untuk aturan tampil cabang.
    const assignments = await this.ensureArmAssignments(surveyId, responseId);

    const data = await this.assembleFillData(survey);
    return { ...data, responseId, assignments };
  }

  /**
   * Pastikan setiap pertanyaan "Penugasan Acak (Eksperimen)" (random_arm) di
   * survei punya nilai arm untuk respons ini. Bila belum ada, sistem mengundi
   * satu opsi dengan peluang sama rata lalu menyimpannya sebagai jawaban —
   * sekali saja, stabil saat responden melanjutkan pengisian. Mengembalikan
   * peta questionId → nilai arm untuk seluruh pertanyaan arm.
   */
  private async ensureArmAssignments(
    surveyId: string,
    responseId: string,
  ): Promise<Record<string, string>> {
    const armQuestions = await this.questionRepository.find({
      where: { surveyId, type: QuestionType.RANDOM_ARM, enabled: true },
      relations: ['options'],
    });
    if (armQuestions.length === 0) return {};

    const existing = await this.answerRepository.find({
      where: { responseId, questionId: In(armQuestions.map((q) => q.id)) },
    });
    const existingByQuestion = new Map(
      existing.map((a) => [a.questionId, a.value]),
    );

    const assignments: Record<string, string> = {};
    const toInsert: Answer[] = [];

    for (const q of armQuestions) {
      if (existingByQuestion.has(q.id)) {
        assignments[q.id] = String(existingByQuestion.get(q.id));
        continue;
      }
      const options = q.options ?? [];
      if (options.length === 0) continue; // arm tanpa kelompok → lewati
      // Undian seragam: tiap kelompok berpeluang sama.
      const picked = options[Math.floor(Math.random() * options.length)];
      const value = picked.value || picked.label;
      assignments[q.id] = value;
      toInsert.push(
        this.answerRepository.create({ responseId, questionId: q.id, value }),
      );
    }

    if (toInsert.length > 0) {
      // orIgnore: kalau ada balapan (dua permintaan paralel), constraint unik
      // (response_id, question_id) menjaga satu arm saja per respons.
      await this.answerRepository
        .createQueryBuilder()
        .insert()
        .values(toInsert)
        .orIgnore()
        .execute();
    }

    return assignments;
  }

  /**
   * Data pengisian untuk surveyor (TPD): pertanyaan + konfigurasi survei, TANPA
   * membuat baris respons (surveyor mengisi banyak kuesioner, dikirim sekali jadi).
   */
  async getSurveyorFillData(
    surveyId: string,
  ): Promise<Omit<SurveyFillData, 'responseId'>> {
    const survey = await this.surveyRepository.findOne({ where: { id: surveyId } });
    if (!survey) {
      throw new NotFoundException(`Survey with id ${surveyId} not found`);
    }
    return this.assembleFillData(survey);
  }

  /** Rakit pertanyaan + konfigurasi survei (dipakai responden & surveyor). */
  private async assembleFillData(
    survey: Survey,
  ): Promise<Omit<SurveyFillData, 'responseId'>> {
    const surveyId = survey.id;
    const [pages, questions] = await Promise.all([
      this.pageRepository.find({ where: { surveyId }, order: { pageNumber: 'ASC' } }),
      this.questionRepository.find({
        // Pertanyaan nonaktif (enabled=false) tidak ditampilkan ke responden
        where: { surveyId, enabled: true },
        order: { orderIndex: 'ASC' },
      }),
    ]);

    const questionIds = questions.map((q) => q.id);
    const [skipRules, visibilityRules] = await Promise.all([
      questionIds.length
        ? this.skipLogicRepository.find({ where: { questionId: In(questionIds) } })
        : Promise.resolve([]),
      questionIds.length
        ? this.visibilityRepository.find({ where: { questionId: In(questionIds) } })
        : Promise.resolve([]),
    ]);

    const pageNumberById = new Map(pages.map((p) => [p.id, p.pageNumber]));
    const skipByQuestion = this.groupSkipConditions(skipRules);
    const visibilityByQuestion = this.groupVisibilityConditions(visibilityRules);

    const fillQuestions: FillQuestion[] = questions
      // Pertanyaan arm eksperimen TIDAK ditampilkan ke responden — nilainya
      // diundi sistem & dikirim lewat `assignments`, hanya jadi sumber aturan tampil.
      .filter((q) => q.type !== QuestionType.RANDOM_ARM)
      .map((q) =>
        this.mapQuestion(
          q,
          survey.randomizeOptions,
          pageNumberById.get(q.pageId) ?? 1,
          skipByQuestion.get(q.id) ?? [],
          visibilityByQuestion.get(q.id) ?? [],
        ),
      );

    const totalPages = this.computeTotalPages(pages, fillQuestions);
    const reward = this.mapReward(survey);
    const maxDuration =
      survey.timeConfig?.maxDurationMinutes ?? survey.maxDurationMinutes ?? undefined;

    return {
      id: survey.id,
      title: survey.title,
      description: survey.description ?? '',
      questions: fillQuestions,
      totalPages,
      formMode: survey.formMode ?? 'paginated',
      captureGps: survey.captureGps ?? false,
      requireSignature: survey.requireSignature ?? false,
      uppercaseAnswers: survey.uppercaseAnswers ?? false,
      maxDuration: maxDuration ?? undefined,
      ...reward,
    };
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Tegakkan kelengkapan profil (data diri/demografi) responden. Tanpa data
   * pembobot, jawaban tidak bisa dianalisis — jadi responden harus melengkapi
   * profil dulu. Otoritatif di sisi server (redirect frontend hanya UX).
   */
  private async assertProfileCompleted(respondentId: string): Promise<void> {
    const rows = await this.responseRepository.manager.query(
      'SELECT profile_completed, phone FROM users WHERE id = $1 LIMIT 1',
      [respondentId],
    );
    const row = rows[0];
    if (!row?.profile_completed) {
      throw new ForbiddenException(
        'Lengkapi data diri Anda terlebih dahulu sebelum mengisi survei.',
      );
    }
    if (!row.phone) {
      throw new ForbiddenException(
        'Lengkapi nomor telepon Anda di halaman Profil sebelum mengisi survei.',
      );
    }
  }

  private async assertSurveyAccessible(surveyId: string): Promise<void> {
    try {
      const access = await this.surveyTimeService.checkSurveyAccess(surveyId);
      if (!access.allowed) {
        throw new ForbiddenException(access.reason);
      }
    } catch (err) {
      if (err instanceof ForbiddenException) throw err;
      // No time config configured → survey has no time/cap restrictions; allow.
      if (err instanceof NotFoundException) return;
      throw err;
    }
  }

  /**
   * Tegakkan kelayakan targeting (gender & wilayah) berdasarkan profil
   * responden. Lewati cepat bila survei tak punya batasan.
   */
  private async assertEligible(
    survey: { allowedGenders?: string[]; allowedProvinces?: string[] },
    respondentId: string,
  ): Promise<void> {
    const genders = survey.allowedGenders ?? [];
    const provinces = survey.allowedProvinces ?? [];
    if (genders.length === 0 && provinces.length === 0) return;

    const rows = await this.responseRepository.manager.query(
      'SELECT gender, province FROM user_profile WHERE user_id = $1 LIMIT 1',
      [respondentId],
    );
    const demo = rows[0] ?? {};
    const result = checkEligibility(
      { allowedGenders: genders, allowedProvinces: provinces },
      { gender: demo.gender, province: demo.province },
    );
    if (!result.allowed) {
      throw new ForbiddenException(result.reason);
    }
  }

  private async getOrCreateInProgressResponse(
    surveyId: string,
    respondentId: string,
    existing: SurveyResponse | null,
  ): Promise<string> {
    if (existing) {
      return existing.id;
    }

    try {
      const created = await this.responseRepository.save(
        this.responseRepository.create({
          surveyId,
          respondentId,
          status: ResponseStatus.IN_PROGRESS,
          startedAt: new Date(),
        }),
      );
      return created.id;
    } catch (error: any) {
      // Race: another request created the response between our check and insert.
      if (
        error.code === '23505' ||
        error.message?.includes('uq_one_response_per_survey')
      ) {
        const raced = await this.responseRepository.findOne({
          where: { surveyId, respondentId },
        });
        if (raced) return raced.id;
      }
      throw error;
    }
  }

  private mapQuestion(
    q: Question,
    randomizeOptions: boolean,
    page: number,
    skipConditions: FillCondition[],
    visibilityConditions: FillCondition[],
  ): FillQuestion {
    const rules = q.validationRules ?? {};
    const numericRange = (rules.numericRange ?? {}) as { min?: number; max?: number };

    const options = (q.options ?? [])
      .slice()
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((o) => ({ id: o.id, label: o.label, value: o.value }));

    const regionConfig: RegionConfig | undefined =
      q.type === 'indonesia_region'
        ? {
            regionDepth: rules.regionDepth ?? 'village',
            lockedProvince: rules.lockedProvince ?? null,
            lockedRegency: rules.lockedRegency ?? null,
          }
        : undefined;

    const ratingConfig: RatingConfig | undefined =
      q.type === 'rating_scale'
        ? {
            ratingMax: rules.ratingMax ?? 5,
            ratingDisplayMode: rules.ratingDisplayMode ?? 'star',
            ratingMinLabel: rules.ratingMinLabel ?? undefined,
            ratingMaxLabel: rules.ratingMaxLabel ?? undefined,
          }
        : undefined;

    const uniqueIdConfig =
      q.type === 'unique_id'
        ? { minLength: rules.minLength ?? undefined, maxLength: rules.maxLength ?? undefined }
        : undefined;

    return {
      id: q.id,
      type: q.type,
      text: q.questionText,
      description: rules.description ?? undefined,
      required: q.required,
      options: options.length > 0 ? options : undefined,
      matrixRows: rules.matrixRows ?? undefined,
      matrixColumns: rules.matrixColumns ?? undefined,
      scaleMin: numericRange.min ?? rules.scaleMin ?? undefined,
      scaleMax: numericRange.max ?? rules.scaleMax ?? undefined,
      // Per-pertanyaan (validationRules.randomizeOptions) menimpa setelan survei.
      randomizeOptions: rules.randomizeOptions ?? randomizeOptions,
      hasOtherOption: q.hasOtherOption,
      skipConditions,
      visibilityConditions,
      page,
      regionConfig,
      ratingConfig,
      uniqueIdConfig,
    };
  }

  /** Skip rules with action 'skip' hide the owning question when the condition is met. */
  private groupSkipConditions(rules: SkipLogicRule[]): Map<string, FillCondition[]> {
    const map = new Map<string, FillCondition[]>();
    for (const rule of rules) {
      if (rule.action !== 'skip') continue; // 'jump_to' is navigation, not modelled client-side
      const list = map.get(rule.questionId) ?? [];
      list.push({
        questionId: rule.sourceQuestionId,
        operator: rule.conditionOperator as FillCondition['operator'],
        value: rule.conditionValue,
      });
      map.set(rule.questionId, list);
    }
    return map;
  }

  /**
   * The respondent UI shows a question only when ALL of its visibilityConditions
   * are met. A 'show' rule maps directly. A 'hide' rule is the inverse, which we
   * can faithfully represent only for equals/not_equals; other 'hide' operators
   * are left to the authoritative server-side check (AnswerValidationService).
   */
  private groupVisibilityConditions(
    rules: VisibilityRule[],
  ): Map<string, FillCondition[]> {
    const map = new Map<string, FillCondition[]>();
    for (const rule of rules) {
      const operator = rule.conditionOperator as FillCondition['operator'];
      let condition: FillCondition | null = null;

      if (rule.visibilityAction === 'show') {
        condition = { questionId: rule.sourceQuestionId, operator, value: rule.conditionValue };
      } else if (operator === 'equals') {
        condition = { questionId: rule.sourceQuestionId, operator: 'not_equals', value: rule.conditionValue };
      } else if (operator === 'not_equals') {
        condition = { questionId: rule.sourceQuestionId, operator: 'equals', value: rule.conditionValue };
      } else {
        this.logger.debug(
          `Skipping client mapping of 'hide' rule with operator '${operator}' for question ${rule.questionId}`,
        );
      }

      if (condition) {
        const list = map.get(rule.questionId) ?? [];
        list.push(condition);
        map.set(rule.questionId, list);
      }
    }
    return map;
  }

  private computeTotalPages(pages: SurveyPage[], questions: FillQuestion[]): number {
    const pageNumbers = [
      ...pages.map((p) => p.pageNumber),
      ...questions.map((q) => q.page),
    ];
    return pageNumbers.length > 0 ? Math.max(...pageNumbers) : 1;
  }

  private mapReward(survey: Survey): {
    rewardMode: 'auto_point' | 'manual';
    rewardPoints?: number;
    rewardDescription?: string;
  } {
    const config = survey.rewardConfig;
    if (survey.rewardMode === 'manual') {
      const parts: string[] = [];
      if (config?.manualRewardType) parts.push(config.manualRewardType);
      if (config?.manualRewardNominal != null) {
        parts.push(`Rp${Number(config.manualRewardNominal).toLocaleString('id-ID')}`);
      }
      return {
        rewardMode: 'manual',
        rewardDescription: parts.length > 0 ? parts.join(' - ') : undefined,
      };
    }

    return {
      rewardMode: 'auto_point',
      rewardPoints: config?.pointsValue ?? undefined,
    };
  }
}
