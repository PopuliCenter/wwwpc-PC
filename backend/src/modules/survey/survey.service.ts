import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Survey } from './entities/survey.entity';
import { checkEligibility } from './utils/eligibility';
import { SurveyTimeConfig } from './entities/survey-time-config.entity';
import { SurveyRewardConfig } from './entities/survey-reward-config.entity';
import { Question } from './entities/question.entity';
import { CreateSurveyDto } from './dto/create-survey.dto';
import { UpdateSurveyDto } from './dto/update-survey.dto';
import { SurveyStatus } from '@shared/enums';
import { QuestionService } from './question.service';

@Injectable()
export class SurveyService {
  private readonly logger = new Logger(SurveyService.name);

  constructor(
    @InjectRepository(Survey)
    private readonly surveyRepository: Repository<Survey>,
    @InjectRepository(SurveyTimeConfig)
    private readonly timeConfigRepository: Repository<SurveyTimeConfig>,
    @InjectRepository(SurveyRewardConfig)
    private readonly rewardConfigRepository: Repository<SurveyRewardConfig>,
    @InjectRepository(Question)
    private readonly questionRepository: Repository<Question>,
    private readonly questionService: QuestionService,
  ) {}

  async findAll(): Promise<Survey[]> {
    return this.surveyRepository.find({
      order: { createdAt: 'DESC' },
      relations: ['timeConfig', 'rewardConfig'],
    });
  }

  /**
   * Daftar survei AKTIF untuk responden (GET /surveys/available).
   * Mengembalikan bentuk siap-pakai: deadline, estimasi waktu, reward, jumlah pertanyaan.
   */
  async getAvailableSurveys(respondentId?: string): Promise<
    Array<{
      id: string;
      title: string;
      description: string;
      deadline: string;
      estimatedTime: number;
      rewardMode: 'auto_point' | 'manual';
      rewardPoints?: number;
      rewardDescription?: string;
      questionCount: number;
      surveyType: string;
      category: string | null;
      completed: boolean;
      startsAt: string | null;
      upcoming: boolean;
    }>
  > {
    const surveys = await this.surveyRepository.find({
      where: { status: SurveyStatus.ACTIVE },
      relations: ['timeConfig', 'rewardConfig'],
      order: { createdAt: 'DESC' },
    });

    // Survei yang SUDAH diselesaikan responden ini (satu respons per survei) —
    // ditandai agar daftar bisa menonaktifkan tombol & menampilkan "Sudah diisi".
    let completedIds = new Set<string>();
    if (respondentId) {
      const doneRows = await this.surveyRepository.manager.query(
        `SELECT survey_id FROM survey_response
         WHERE respondent_id = $1 AND status = 'complete'`,
        [respondentId],
      );
      completedIds = new Set(doneRows.map((r: any) => r.survey_id));
    }

    // Filter berdasarkan kelayakan targeting (gender & wilayah) bila ada
    // respondentId. Survei yang tak sesuai profil disembunyikan dari daftar.
    let eligible = surveys;
    if (respondentId) {
      const rows = await this.surveyRepository.manager.query(
        'SELECT gender, province FROM user_profile WHERE user_id = $1 LIMIT 1',
        [respondentId],
      );
      const demo = rows[0] ?? {};
      eligible = surveys.filter(
        (s) =>
          checkEligibility(
            { allowedGenders: s.allowedGenders, allowedProvinces: s.allowedProvinces },
            { gender: demo.gender, province: demo.province },
          ).allowed,
      );
    }

    return Promise.all(
      eligible.map(async (s) => {
        const questionCount = await this.questionRepository.count({
          where: { surveyId: s.id, enabled: true },
        });
        const deadline = s.endDatetime ?? s.timeConfig?.endDatetime ?? null;
        const startsAt = s.startDatetime ?? s.timeConfig?.startDatetime ?? null;
        // "Akan datang": survei sudah aktif tapi waktu mulainya masih di depan.
        const upcoming = startsAt ? new Date(startsAt).getTime() > Date.now() : false;
        return {
          id: s.id,
          title: s.title,
          description: s.description ?? '',
          deadline: (deadline ?? new Date()).toISOString(),
          estimatedTime: s.maxDurationMinutes ?? s.timeConfig?.maxDurationMinutes ?? 10,
          rewardMode: s.rewardMode === 'automatic' ? ('auto_point' as const) : ('manual' as const),
          rewardPoints: s.rewardConfig?.pointsValue ?? undefined,
          rewardDescription: s.rewardConfig?.manualRewardType ?? undefined,
          questionCount,
          surveyType: s.surveyType ?? 'lainnya',
          category: s.category ?? null,
          completed: completedIds.has(s.id),
          startsAt: startsAt ? new Date(startsAt).toISOString() : null,
          upcoming,
        };
      }),
    );
  }

  /**
   * Ringkasan survei: progres kuota, jumlah respons, sebaran gender & wilayah,
   * dan daftar responden yang sudah menyelesaikan. Agregasi via SQL.
   */
  async getSurveySummary(surveyId: string): Promise<{
    id: string;
    title: string;
    status: string;
    maxRespondents: number | null;
    totalResponses: number;
    inProgress: number;
    byGender: Array<{ label: string; count: number }>;
    byProvince: Array<{ label: string; count: number }>;
    respondents: Array<{
      fullName: string;
      gender: string | null;
      province: string | null;
      city: string | null;
      submittedAt: string | null;
    }>;
  }> {
    const survey = await this.surveyRepository.findOne({ where: { id: surveyId } });
    if (!survey) {
      throw new NotFoundException(`Survey with id ${surveyId} not found`);
    }
    const m = this.surveyRepository.manager;

    const counts = await m.query(
      `SELECT
         COUNT(*) FILTER (WHERE status='complete')::int AS total,
         COUNT(*) FILTER (WHERE status='in_progress')::int AS in_progress
       FROM survey_response WHERE survey_id=$1`,
      [surveyId],
    );
    const byGender = await m.query(
      // gender adalah enum → cast ke text agar COALESCE dgn teks valid.
      `SELECT COALESCE(p.gender::text,'(tidak diisi)') AS label, COUNT(*)::int AS count
       FROM survey_response r LEFT JOIN user_profile p ON p.user_id=r.respondent_id
       WHERE r.survey_id=$1 AND r.status='complete'
       GROUP BY p.gender ORDER BY count DESC`,
      [surveyId],
    );
    const byProvince = await m.query(
      `SELECT COALESCE(p.province,'(tidak diisi)') AS label, COUNT(*)::int AS count
       FROM survey_response r LEFT JOIN user_profile p ON p.user_id=r.respondent_id
       WHERE r.survey_id=$1 AND r.status='complete'
       GROUP BY p.province ORDER BY count DESC`,
      [surveyId],
    );
    const respondents = await m.query(
      `SELECT u.full_name AS "fullName", p.gender, p.province, p.city,
              r.submitted_at AS "submittedAt"
       FROM survey_response r
       JOIN users u ON u.id=r.respondent_id
       LEFT JOIN user_profile p ON p.user_id=r.respondent_id
       WHERE r.survey_id=$1 AND r.status='complete'
       ORDER BY r.submitted_at DESC NULLS LAST
       LIMIT 500`,
      [surveyId],
    );

    return {
      id: survey.id,
      title: survey.title,
      status: survey.status,
      maxRespondents: survey.maxRespondents ?? null,
      totalResponses: counts[0]?.total ?? 0,
      inProgress: counts[0]?.in_progress ?? 0,
      byGender,
      byProvince,
      respondents,
    };
  }

  async createSurvey(userId: string, dto: CreateSurveyDto): Promise<Survey> {
    const survey = this.surveyRepository.create({
      createdBy: userId,
      title: dto.title,
      description: dto.description || null,
      rewardMode: dto.rewardMode,
      randomizeOptions: dto.randomizeOptions ?? false,
      formMode: dto.formMode ?? 'paginated',
      surveyType: dto.surveyType ?? 'lainnya',
      category: dto.category?.trim() || null,
      captureGps: dto.captureGps ?? false,
      requireSignature: dto.requireSignature ?? false,
      uppercaseAnswers: dto.uppercaseAnswers ?? false,
      allowedGenders: dto.allowedGenders ?? [],
      allowedProvinces: dto.allowedProvinces ?? [],
      startDatetime: dto.timeConfig?.startDatetime ? new Date(dto.timeConfig.startDatetime) : null,
      endDatetime: dto.timeConfig?.endDatetime ? new Date(dto.timeConfig.endDatetime) : null,
      maxDurationMinutes: dto.timeConfig?.maxDurationMinutes ?? null,
      // 0 = tak terbatas → simpan NULL agar cap responden tidak memblokir semua.
      maxRespondents: dto.timeConfig?.maxRespondents || null,
      status: SurveyStatus.DRAFT,
    });

    const savedSurvey = await this.surveyRepository.save(survey);

    // Create time config
    const timeConfig = this.timeConfigRepository.create({
      surveyId: savedSurvey.id,
      startDatetime: dto.timeConfig?.startDatetime ? new Date(dto.timeConfig.startDatetime) : null,
      endDatetime: dto.timeConfig?.endDatetime ? new Date(dto.timeConfig.endDatetime) : null,
      maxDurationMinutes: dto.timeConfig?.maxDurationMinutes ?? null,
      // 0 = tak terbatas → NULL (lihat catatan di atas).
      maxRespondents: dto.timeConfig?.maxRespondents || null,
      currentRespondentCount: 0,
    });
    await this.timeConfigRepository.save(timeConfig);

    // Create reward config
    const rewardConfig = this.rewardConfigRepository.create({
      surveyId: savedSurvey.id,
      rewardMode: dto.rewardMode,
      pointsValue: dto.rewardConfig?.pointsValue ?? null,
      manualRewardType: dto.rewardConfig?.manualRewardType ?? null,
      manualRewardNominal: dto.rewardConfig?.manualRewardNominal ?? null,
    });
    await this.rewardConfigRepository.save(rewardConfig);

    this.logger.log(`Survey created: ${savedSurvey.id} by user ${userId}`);

    return this.findById(savedSurvey.id);
  }

  async updateSurvey(surveyId: string, dto: UpdateSurveyDto): Promise<Survey> {
    const survey = await this.findById(surveyId);

    // Update survey fields
    if (dto.title !== undefined) survey.title = dto.title;
    if (dto.description !== undefined) survey.description = dto.description;
    if (dto.rewardMode !== undefined) survey.rewardMode = dto.rewardMode;
    if (dto.randomizeOptions !== undefined) survey.randomizeOptions = dto.randomizeOptions;
    if (dto.formMode !== undefined) survey.formMode = dto.formMode;
    if (dto.surveyType !== undefined) survey.surveyType = dto.surveyType;
    if (dto.category !== undefined) survey.category = dto.category?.trim() || null;
    if (dto.captureGps !== undefined) survey.captureGps = dto.captureGps;
    if (dto.requireSignature !== undefined) survey.requireSignature = dto.requireSignature;
    if (dto.uppercaseAnswers !== undefined) survey.uppercaseAnswers = dto.uppercaseAnswers;
    if (dto.allowedGenders !== undefined) survey.allowedGenders = dto.allowedGenders;
    if (dto.allowedProvinces !== undefined) survey.allowedProvinces = dto.allowedProvinces;

    // Update time-related fields on survey
    if (dto.timeConfig) {
      if (dto.timeConfig.startDatetime !== undefined) {
        survey.startDatetime = dto.timeConfig.startDatetime
          ? new Date(dto.timeConfig.startDatetime)
          : null;
      }
      if (dto.timeConfig.endDatetime !== undefined) {
        survey.endDatetime = dto.timeConfig.endDatetime
          ? new Date(dto.timeConfig.endDatetime)
          : null;
      }
      if (dto.timeConfig.maxDurationMinutes !== undefined) {
        survey.maxDurationMinutes = dto.timeConfig.maxDurationMinutes;
      }
      if (dto.timeConfig.maxRespondents !== undefined) {
        // 0 = tak terbatas → NULL agar cap responden tidak memblokir semua.
        survey.maxRespondents = dto.timeConfig.maxRespondents || null;
      }
    }

    await this.surveyRepository.save(survey);

    // Update time config
    if (dto.timeConfig) {
      const timeConfig = await this.timeConfigRepository.findOne({
        where: { surveyId },
      });
      if (timeConfig) {
        if (dto.timeConfig.startDatetime !== undefined) {
          timeConfig.startDatetime = dto.timeConfig.startDatetime
            ? new Date(dto.timeConfig.startDatetime)
            : null;
        }
        if (dto.timeConfig.endDatetime !== undefined) {
          timeConfig.endDatetime = dto.timeConfig.endDatetime
            ? new Date(dto.timeConfig.endDatetime)
            : null;
        }
        if (dto.timeConfig.maxDurationMinutes !== undefined) {
          timeConfig.maxDurationMinutes = dto.timeConfig.maxDurationMinutes;
        }
        if (dto.timeConfig.maxRespondents !== undefined) {
          // 0 = tak terbatas → NULL (lihat catatan di atas).
          timeConfig.maxRespondents = dto.timeConfig.maxRespondents || null;
        }
        await this.timeConfigRepository.save(timeConfig);
      }
    }

    // Update reward config
    if (dto.rewardConfig || dto.rewardMode !== undefined) {
      const rewardConfig = await this.rewardConfigRepository.findOne({
        where: { surveyId },
      });
      if (rewardConfig) {
        if (dto.rewardMode !== undefined) {
          rewardConfig.rewardMode = dto.rewardMode;
        }
        if (dto.rewardConfig?.pointsValue !== undefined) {
          rewardConfig.pointsValue = dto.rewardConfig.pointsValue;
        }
        if (dto.rewardConfig?.manualRewardType !== undefined) {
          rewardConfig.manualRewardType = dto.rewardConfig.manualRewardType;
        }
        if (dto.rewardConfig?.manualRewardNominal !== undefined) {
          rewardConfig.manualRewardNominal = dto.rewardConfig.manualRewardNominal;
        }
        await this.rewardConfigRepository.save(rewardConfig);
      }
    }

    this.logger.log(`Survey updated: ${surveyId}`);

    return this.findById(surveyId);
  }

  async duplicateSurvey(surveyId: string, userId: string): Promise<Survey> {
    const original = await this.findById(surveyId);

    const duplicateDto: CreateSurveyDto = {
      title: `${original.title} (Copy)`,
      description: original.description ?? undefined,
      rewardMode: original.rewardMode,
      randomizeOptions: original.randomizeOptions,
      formMode: original.formMode,
      surveyType: original.surveyType,
      category: original.category ?? undefined,
      captureGps: original.captureGps,
      requireSignature: original.requireSignature,
      uppercaseAnswers: original.uppercaseAnswers,
      allowedGenders: original.allowedGenders ?? [],
      allowedProvinces: original.allowedProvinces ?? [],
      timeConfig: {
        startDatetime: original.timeConfig?.startDatetime?.toISOString(),
        endDatetime: original.timeConfig?.endDatetime?.toISOString(),
        maxDurationMinutes: original.timeConfig?.maxDurationMinutes ?? undefined,
        maxRespondents: original.timeConfig?.maxRespondents ?? undefined,
      },
      rewardConfig: {
        rewardMode: original.rewardConfig?.rewardMode ?? original.rewardMode,
        pointsValue: original.rewardConfig?.pointsValue ?? undefined,
        manualRewardType: original.rewardConfig?.manualRewardType ?? undefined,
        manualRewardNominal: original.rewardConfig?.manualRewardNominal
          ? Number(original.rewardConfig.manualRewardNominal)
          : undefined,
      },
    };

    const newSurvey = await this.createSurvey(userId, duplicateDto);

    // Salin SEMUA pertanyaan (beserta opsi) ke survei baru — tanpa ini, survei
    // hasil duplikat tampil tanpa pertanyaan ("file pertanyaan kosong").
    const originalQuestions = await this.questionRepository.find({
      where: { surveyId },
      order: { orderIndex: 'ASC' },
    });
    if (originalQuestions.length > 0) {
      // Salin juga aturan skip/visibilitas; clientId = id pertanyaan asli, dan
      // referensi aturan dipetakan ulang ke id baru oleh bulkReplaceQuestions.
      const logic = await this.questionService.getSurveyLogicRules(surveyId);
      const mapped = originalQuestions.map((q) => ({
        clientId: q.id,
        type: q.type,
        text: q.questionText,
        required: q.required,
        enabled: q.enabled,
        order: q.orderIndex,
        hasOtherOption: q.hasOtherOption,
        validationRules: q.validationRules,
        options: [...(q.options ?? [])]
          .sort((a, b) => a.orderIndex - b.orderIndex)
          .map((o) => ({ label: o.label, value: o.value, orderIndex: o.orderIndex })),
        skipLogicRules: logic.skip
          .filter((r) => r.questionId === q.id)
          .map((r) => ({
            sourceQuestionId: r.sourceQuestionId,
            operator: r.conditionOperator,
            conditionValue: r.conditionValue,
            action: r.action,
            targetQuestionId: r.targetQuestionId,
          })),
        visibilityRules: logic.visibility
          .filter((r) => r.questionId === q.id)
          .map((r) => ({
            sourceQuestionId: r.sourceQuestionId,
            operator: r.conditionOperator,
            conditionValue: r.conditionValue,
            visibilityAction: r.visibilityAction,
          })),
      }));
      await this.questionService.bulkReplaceQuestions(newSurvey.id, mapped);
    }

    this.logger.log(
      `Survey duplicated from ${surveyId} to ${newSurvey.id} (${originalQuestions.length} pertanyaan) by user ${userId}`,
    );

    return this.findById(newSurvey.id);
  }

  async activateSurvey(surveyId: string): Promise<Survey> {
    const survey = await this.findById(surveyId);

    if (survey.status === SurveyStatus.ARCHIVED) {
      throw new BadRequestException('Survei terarsip tidak bisa diaktifkan');
    }

    survey.status = SurveyStatus.ACTIVE;
    await this.surveyRepository.save(survey);

    this.logger.log(`Survey activated: ${surveyId}`);

    return this.findById(surveyId);
  }

  async deactivateSurvey(surveyId: string): Promise<Survey> {
    const survey = await this.findById(surveyId);

    if (survey.status === SurveyStatus.ARCHIVED) {
      throw new BadRequestException('Cannot deactivate an archived survey');
    }

    survey.status = SurveyStatus.INACTIVE;
    await this.surveyRepository.save(survey);

    this.logger.log(`Survey deactivated: ${surveyId}`);

    return this.findById(surveyId);
  }

  async deleteSurvey(surveyId: string): Promise<void> {
    const survey = await this.findById(surveyId);

    await this.surveyRepository.remove(survey);

    this.logger.log(`Survey deleted: ${surveyId}`);
  }

  async archiveSurvey(surveyId: string): Promise<Survey> {
    const survey = await this.findById(surveyId);

    survey.status = SurveyStatus.ARCHIVED;
    survey.archivedAt = new Date();
    await this.surveyRepository.save(survey);

    this.logger.log(`Survey archived: ${surveyId}`);

    return this.findById(surveyId);
  }

  async findById(id: string): Promise<Survey> {
    const survey = await this.surveyRepository.findOne({
      where: { id },
      relations: ['timeConfig', 'rewardConfig'],
    });

    if (!survey) {
      throw new NotFoundException(`Survey with id ${id} not found`);
    }

    return survey;
  }
}
