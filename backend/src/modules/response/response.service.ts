import {
  Injectable,
  ConflictException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, In, Repository, SelectQueryBuilder } from 'typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { SurveyResponse, ResponseStatus } from './entities/survey-response.entity';
import { Answer } from './entities/answer.entity';
import { ManualRewardDistribution, ManualRewardStatus } from './entities/manual-reward-distribution.entity';
import { SubmitResponseDto } from './dto/submit-response.dto';
import { SaveProgressDto } from './dto/save-progress.dto';
import { ResponseFilterDto } from './dto/response-filter.dto';
import { AllResponsesFilterDto } from './dto/all-responses-filter.dto';
import { SurveyTimeService } from '@modules/survey/services/survey-time.service';
import { AnswerValidationService } from '@modules/survey/services/answer-validation.service';
import { EventType, ResponseSubmittedPayload } from '@modules/events/event-types';
import {
  createPaginatedResponse,
  calculateSkipTake,
} from '@shared/helpers/pagination.helper';
import { PaginatedResponse } from '@shared/interfaces';

/**
 * Minimum number of seconds a respondent must spend on a survey before a
 * submission is accepted. Submissions faster than this are almost certainly
 * automated (bots/scripts) and are rejected as a basic anti-fraud measure.
 * Only enforced when we have a server-recorded start time (an in-progress
 * response created via save-progress).
 */
const MIN_COMPLETION_SECONDS = Number(process.env.MIN_COMPLETION_SECONDS ?? 5);

/** Item respons untuk panel admin lintas-survei. */
export interface AdminResponseItem {
  id: string;
  surveyId: string;
  surveyTitle: string;
  respondentName: string;
  respondentPhone: string | null;
  status: 'completed' | 'partial' | 'abandoned';
  submittedAt: string;
  deviceType: string;
  surveyType: string;
  category: string | null;
  rewardMode: 'automatic' | 'manual';
  rewardType: string | null;
  destinationNumber: string | null;
  rewardDistributed: boolean;
  /** Dugaan duplikat: nomor tujuan sama dipakai >1 respons (indikasi fraud). */
  duplicateFlag: boolean;
}

@Injectable()
export class ResponseService {
  private readonly logger = new Logger(ResponseService.name);

  constructor(
    @InjectRepository(SurveyResponse)
    private readonly responseRepository: Repository<SurveyResponse>,
    @InjectRepository(Answer)
    private readonly answerRepository: Repository<Answer>,
    @InjectRepository(ManualRewardDistribution)
    private readonly manualRewardRepository: Repository<ManualRewardDistribution>,
    private readonly surveyTimeService: SurveyTimeService,
    private readonly answerValidationService: AnswerValidationService,
    private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
  ) {}

  /**
   * Submit a complete response to a survey.
   * Enforces one-response-per-survey via unique constraint.
   * Validates timer if max_duration is configured.
   * All writes (response + answers) run in a single DB transaction so a partial
   * failure never leaves a response without its answers.
   * Emits RESPONSE_SUBMITTED after commit to trigger reward crediting,
   * confirmation email, and audit logging.
   */
  async submitResponse(
    surveyId: string,
    respondentId: string,
    dto: SubmitResponseDto,
  ): Promise<SurveyResponse> {
    // Idempotensi offline → sync: jika pengiriman dengan kunci yang sama sudah
    // tercatat (retry setelah online kembali), kembalikan respons yang ada
    // tanpa menimbulkan Conflict atau memproses ulang reward.
    if (dto.clientSubmissionId) {
      const byKey = await this.responseRepository.findOne({
        where: { clientSubmissionId: dto.clientSubmissionId },
      });
      if (byKey) return this.findResponseById(byKey.id);
    }

    // Check if respondent already has a complete response
    const existingResponse = await this.responseRepository.findOne({
      where: { surveyId, respondentId },
    });

    if (existingResponse && existingResponse.status === ResponseStatus.COMPLETE) {
      throw new ConflictException(
        'Anda sudah mengirim respons untuk survei ini. Satu responden hanya boleh mengirim satu respons per survei.',
      );
    }

    // Check submission is allowed (time/respondent cap)
    const submissionCheck = await this.surveyTimeService.checkSubmissionAllowed(surveyId);
    if (!submissionCheck.allowed) {
      throw new ForbiddenException(submissionCheck.reason);
    }

    // Server-side answer validation (required, type, range, options, file refs).
    // The client validates too, but it is untrusted — re-validate authoritatively.
    await this.answerValidationService.validate(surveyId, dto.answers, {
      respondentId,
      enforceRequired: true,
      enforceTypes: true,
    });

    let savedResponseId: string;

    // Validate timer if there's an in-progress response
    if (existingResponse && existingResponse.status === ResponseStatus.IN_PROGRESS) {
      const timeConfig = await this.surveyTimeService.getTimeConfig(surveyId);
      if (
        this.surveyTimeService.isTimerExpired(
          timeConfig.maxDurationMinutes,
          existingResponse.startedAt,
        )
      ) {
        throw new ForbiddenException(
          'Waktu pengisian survei telah habis. Respons tidak dapat dikirim.',
        );
      }

      // Anti-fraud: reject implausibly fast completions (likely bots).
      this.assertMinimumCompletionTime(existingResponse.startedAt);

      savedResponseId = await this.dataSource.transaction(async (manager) => {
        existingResponse.status = ResponseStatus.COMPLETE;
        existingResponse.submittedAt = new Date();
        existingResponse.deviceType = dto.deviceType || existingResponse.deviceType;
        if (dto.destinationNumber !== undefined) {
          existingResponse.destinationNumber = dto.destinationNumber || null;
        }
        if (dto.rewardType !== undefined) {
          existingResponse.rewardType = dto.rewardType || null;
        }
        // Geolokasi: start hanya diisi jika belum ada (direkam saat buka form),
        // end direkam saat submit.
        if (dto.startLatitude != null && existingResponse.startLatitude == null) {
          existingResponse.startLatitude = dto.startLatitude;
          existingResponse.startLongitude = dto.startLongitude ?? null;
        }
        if (dto.endLatitude != null) {
          existingResponse.endLatitude = dto.endLatitude;
          existingResponse.endLongitude = dto.endLongitude ?? null;
        }
        if (dto.clientSubmissionId && !existingResponse.clientSubmissionId) {
          existingResponse.clientSubmissionId = dto.clientSubmissionId;
        }
        const saved = await manager.save(existingResponse);

        // Upsert answers within the same transaction
        await this.upsertAnswers(manager, saved.id, dto.answers);
        return saved.id;
      });
    } else {
      // Create new response (no existing in-progress)
      try {
        savedResponseId = await this.dataSource.transaction(async (manager) => {
          const response = manager.create(SurveyResponse, {
            surveyId,
            respondentId,
            status: ResponseStatus.COMPLETE,
            deviceType: dto.deviceType || null,
            startedAt: new Date(),
            submittedAt: new Date(),
            destinationNumber: dto.destinationNumber || null,
            rewardType: dto.rewardType || null,
            startLatitude: dto.startLatitude ?? null,
            startLongitude: dto.startLongitude ?? null,
            endLatitude: dto.endLatitude ?? null,
            endLongitude: dto.endLongitude ?? null,
            clientSubmissionId: dto.clientSubmissionId ?? null,
          });

          const saved = await manager.save(response);
          await this.saveAnswers(manager, saved.id, dto.answers);
          return saved.id;
        });
      } catch (error: any) {
        // Handle unique constraint violation
        if (error.code === '23505' || error.message?.includes('uq_one_response_per_survey')) {
          // Race sync: bentrok karena clientSubmissionId yang sama → idempoten.
          if (dto.clientSubmissionId) {
            const raced = await this.responseRepository.findOne({
              where: { clientSubmissionId: dto.clientSubmissionId },
            });
            if (raced) return this.findResponseById(raced.id);
          }
          throw new ConflictException(
            'Anda sudah mengirim respons untuk survei ini. Satu responden hanya boleh mengirim satu respons per survei.',
          );
        }
        throw error;
      }
    }

    // Atomic increment of respondent count (safe against concurrent submits)
    await this.surveyTimeService.incrementRespondentCount(surveyId);

    // Emit domain event AFTER the transaction commits so downstream handlers
    // (reward crediting, confirmation email, audit log) only run on success.
    await this.emitResponseSubmitted(surveyId, respondentId, savedResponseId);

    return this.findResponseById(savedResponseId);
  }

  /**
   * Save progress for an in-progress response (auto-save).
   * If no response exists, creates a new in-progress response.
   * If an in-progress response exists, updates the answers.
   */
  async saveProgress(
    surveyId: string,
    respondentId: string,
    dto: SaveProgressDto,
  ): Promise<SurveyResponse> {
    // Lenient validation for auto-save: only reject answers tied to questions
    // that don't belong to this survey. Required/format checks are deferred to
    // final submit so a partially-filled draft never fails to save.
    await this.answerValidationService.validate(surveyId, dto.answers, {
      respondentId,
      enforceRequired: false,
      enforceTypes: false,
    });

    let response = await this.responseRepository.findOne({
      where: { surveyId, respondentId },
    });

    if (response && response.status === ResponseStatus.COMPLETE) {
      throw new ConflictException(
        'Respons sudah dikirim. Tidak dapat menyimpan progress untuk survei yang sudah selesai.',
      );
    }

    if (!response) {
      // Create new in-progress response
      try {
        response = this.responseRepository.create({
          surveyId,
          respondentId,
          status: ResponseStatus.IN_PROGRESS,
          deviceType: dto.deviceType || null,
          startedAt: new Date(),
          startLatitude: dto.startLatitude ?? null,
          startLongitude: dto.startLongitude ?? null,
        });
        response = await this.responseRepository.save(response);
      } catch (error: any) {
        if (error.code === '23505' || error.message?.includes('uq_one_response_per_survey')) {
          // Race condition: response was created between check and insert
          response = await this.responseRepository.findOne({
            where: { surveyId, respondentId },
          });
          if (!response) {
            throw error;
          }
        } else {
          throw error;
        }
      }
    }

    // Upsert answers
    await this.upsertAnswers(this.dataSource.manager, response.id, dto.answers);

    return this.findResponseById(response.id);
  }

  /**
   * Get existing response for a respondent on a survey.
   * Used for resuming in-progress responses.
   */
  async getRespondentResponse(
    surveyId: string,
    respondentId: string,
  ): Promise<SurveyResponse | null> {
    return this.responseRepository.findOne({
      where: { surveyId, respondentId },
      relations: ['answers'],
    });
  }

  /**
   * Get responses for a survey with filters and pagination.
   * All filters are applied as AND conditions.
   */
  async getResponses(
    surveyId: string,
    filters: ResponseFilterDto,
  ): Promise<PaginatedResponse<SurveyResponse>> {
    const { skip, take } = calculateSkipTake({
      page: filters.page,
      pageSize: filters.pageSize,
    });

    const qb = this.responseRepository
      .createQueryBuilder('response')
      .leftJoinAndSelect('response.respondent', 'respondent')
      .leftJoin('user_profile', 'profile', 'profile.user_id = respondent.id')
      .where('response.survey_id = :surveyId', { surveyId });

    this.applyFilters(qb, filters);

    qb.orderBy('response.startedAt', 'DESC');
    qb.skip(skip).take(take);

    const [data, total] = await qb.getManyAndCount();

    return createPaginatedResponse(data, total, {
      page: filters.page,
      pageSize: filters.pageSize,
    });
  }

  /**
   * Daftar respons LINTAS-SURVEI untuk panel admin (dengan filter + pencarian
   * + penanda dugaan duplikat nomor tujuan). Mengembalikan array siap-pakai.
   */
  async getAllResponses(filters: AllResponsesFilterDto): Promise<AdminResponseItem[]> {
    const statusMap: Record<string, ResponseStatus> = {
      completed: ResponseStatus.COMPLETE,
      partial: ResponseStatus.IN_PROGRESS,
      abandoned: ResponseStatus.ABANDONED,
    };

    const qb = this.responseRepository
      .createQueryBuilder('r')
      .leftJoinAndSelect('r.respondent', 'respondent')
      .leftJoinAndSelect('r.survey', 'survey')
      .leftJoin('user_profile', 'profile', 'profile.user_id = r.respondent_id');

    if (filters.surveyId) {
      qb.andWhere('r.survey_id = :surveyId', { surveyId: filters.surveyId });
    }
    if (filters.surveyType) {
      qb.andWhere('survey.survey_type = :surveyType', { surveyType: filters.surveyType });
    }
    if (filters.category) {
      qb.andWhere('survey.category ILIKE :category', { category: `%${filters.category}%` });
    }
    if (filters.status && statusMap[filters.status]) {
      qb.andWhere('r.status = :status', { status: statusMap[filters.status] });
    }
    if (filters.deviceType) {
      qb.andWhere('r.device_type = :deviceType', { deviceType: filters.deviceType });
    }
    if (filters.startDate) {
      qb.andWhere('r.started_at >= :startDate', { startDate: new Date(filters.startDate) });
    }
    if (filters.endDate) {
      qb.andWhere('r.started_at <= :endDate', { endDate: new Date(filters.endDate) });
    }
    if (filters.region) {
      qb.andWhere('(profile.city ILIKE :region OR profile.province ILIKE :region)', {
        region: `%${filters.region}%`,
      });
    }
    if (filters.search) {
      qb.andWhere('(respondent.full_name ILIKE :search OR respondent.phone ILIKE :search)', {
        search: `%${filters.search}%`,
      });
    }

    qb.orderBy('r.started_at', 'DESC').take(500);

    const rows = await qb.getMany();

    // Penanda dugaan duplikat (fraud): nomor tujuan yang dipakai >1 kali di
    // SELURUH respons (lintas survei), dihitung via agregasi DB — akurat &
    // tidak terbatas pada 500 baris yang ditampilkan.
    const duplicateNumbers = await this.getDuplicateDestinationNumbers();

    const reverseStatus: Record<ResponseStatus, 'completed' | 'partial' | 'abandoned'> = {
      [ResponseStatus.COMPLETE]: 'completed',
      [ResponseStatus.IN_PROGRESS]: 'partial',
      [ResponseStatus.ABANDONED]: 'abandoned',
    };

    return rows.map((r) => ({
      id: r.id,
      surveyId: r.surveyId,
      surveyTitle: r.survey?.title ?? '-',
      respondentName: r.respondent?.fullName ?? '-',
      respondentPhone: r.respondent?.phone ?? null,
      status: reverseStatus[r.status],
      submittedAt: (r.submittedAt ?? r.startedAt).toISOString(),
      deviceType: r.deviceType ?? '-',
      surveyType: r.survey?.surveyType ?? 'lainnya',
      category: r.survey?.category ?? null,
      rewardMode: (r.survey?.rewardMode ?? 'automatic') as 'automatic' | 'manual',
      rewardType: r.rewardType,
      destinationNumber: r.destinationNumber,
      rewardDistributed: r.rewardDistributed,
      duplicateFlag: r.destinationNumber
        ? duplicateNumbers.has(r.destinationNumber)
        : false,
    }));
  }

  /**
   * Tandai reward sejumlah respons sebagai sudah didistribusikan (rekonsiliasi
   * top-up oleh admin).
   */
  async markResponsesDistributed(
    responseIds: string[],
    adminId: string,
  ): Promise<{ updated: number }> {
    if (!responseIds || responseIds.length === 0) {
      return { updated: 0 };
    }
    // Idempoten: hanya tandai yang BELUM terdistribusi, agar penandaan ulang
    // tidak menimpa waktu/pelaku distribusi awal.
    const result = await this.responseRepository.update(
      { id: In(responseIds), rewardDistributed: false },
      {
        rewardDistributed: true,
        rewardDistributedAt: new Date(),
        rewardDistributedBy: adminId,
      },
    );
    return { updated: result.affected ?? 0 };
  }

  /**
   * Get manual reward recipients for a survey.
   * Only returns respondents with status 'complete'.
   * Ensures a distribution record exists for every complete respondent without
   * issuing one query per respondent (bulk fetch + bulk insert of missing rows).
   */
  async getManualRewardRecipients(surveyId: string): Promise<ManualRewardDistribution[]> {
    // Get all complete responses for this survey
    const completeResponses = await this.responseRepository.find({
      where: { surveyId, status: ResponseStatus.COMPLETE },
      select: ['respondentId'],
    });

    if (completeResponses.length === 0) {
      return [];
    }

    const respondentIds = completeResponses.map((r) => r.respondentId);

    // Bulk-fetch existing distributions in one query
    const existing = await this.manualRewardRepository.find({
      where: { surveyId },
      relations: ['respondent'],
    });
    const existingByRespondent = new Map(
      existing.map((d) => [d.respondentId, d]),
    );

    // Determine which respondents still need a distribution row
    const missing = respondentIds.filter((id) => !existingByRespondent.has(id));

    if (missing.length > 0) {
      // Bulk-insert all missing distribution rows in one statement
      const toCreate = missing.map((respondentId) =>
        this.manualRewardRepository.create({
          surveyId,
          respondentId,
          status: ManualRewardStatus.PENDING,
        }),
      );
      await this.manualRewardRepository.save(toCreate);

      // Re-fetch the newly created rows with their respondent relation
      const created = await this.manualRewardRepository.find({
        where: { surveyId },
        relations: ['respondent'],
      });
      return created.filter((d) => respondentIds.includes(d.respondentId));
    }

    // Return only distributions for respondents with a complete response
    return existing.filter((d) => respondentIds.includes(d.respondentId));
  }

  /**
   * Mark reward as distributed for individual or bulk respondents.
   * Records timestamp and admin who performed the action.
   */
  async markRewardDistributed(
    surveyId: string,
    respondentIds: string[],
    adminId: string,
  ): Promise<ManualRewardDistribution[]> {
    const results: ManualRewardDistribution[] = [];

    for (const respondentId of respondentIds) {
      // Verify respondent has a complete response
      const response = await this.responseRepository.findOne({
        where: { surveyId, respondentId, status: ResponseStatus.COMPLETE },
      });

      if (!response) {
        this.logger.warn(
          `Skipping reward distribution for respondent ${respondentId}: no complete response found for survey ${surveyId}`,
        );
        continue;
      }

      let distribution = await this.manualRewardRepository.findOne({
        where: { surveyId, respondentId },
      });

      if (!distribution) {
        distribution = this.manualRewardRepository.create({
          surveyId,
          respondentId,
          status: ManualRewardStatus.DISTRIBUTED,
          distributedAt: new Date(),
          distributedBy: adminId,
        });
      } else {
        distribution.status = ManualRewardStatus.DISTRIBUTED;
        distribution.distributedAt = new Date();
        distribution.distributedBy = adminId;
      }

      const saved = await this.manualRewardRepository.save(distribution);
      results.push(saved);

      this.logger.log(
        `[AUDIT] Manual reward distributed: surveyId=${surveyId}, respondentId=${respondentId}, adminId=${adminId}`,
      );
    }

    return results;
  }

  // --- Private helpers ---

  /**
   * Nomor tujuan reward yang dipakai lebih dari satu kali di seluruh respons
   * (indikasi dugaan fraud). Dihitung via GROUP BY/HAVING agar akurat lintas
   * survei dan tidak terbatas pada baris yang ditampilkan.
   */
  private async getDuplicateDestinationNumbers(): Promise<Set<string>> {
    const rows: Array<{ destination_number: string }> = await this.responseRepository
      .createQueryBuilder('r')
      .select('r.destination_number', 'destination_number')
      .where('r.destination_number IS NOT NULL')
      .groupBy('r.destination_number')
      .having('COUNT(*) > 1')
      .getRawMany();
    return new Set(rows.map((x) => x.destination_number));
  }

  /**
   * Reject submissions completed faster than the configured minimum time.
   * A real respondent cannot read and answer a survey in a couple of seconds,
   * so an implausibly short duration is treated as automated abuse.
   */
  private assertMinimumCompletionTime(startedAt: Date): void {
    const elapsedSeconds = (Date.now() - startedAt.getTime()) / 1000;
    if (elapsedSeconds < MIN_COMPLETION_SECONDS) {
      this.logger.warn(
        `Submission rejected as too fast: elapsed=${elapsedSeconds}s, min=${MIN_COMPLETION_SECONDS}s`,
      );
      throw new ForbiddenException(
        'Respons dikirim terlalu cepat. Mohon isi survei dengan sungguh-sungguh.',
      );
    }
  }

  /**
   * Build and emit the RESPONSE_SUBMITTED event with the full payload required
   * by downstream handlers. Respondent and survey metadata are fetched in a
   * single query. Failure to build the payload must not roll back the
   * already-committed submission, so errors are logged and swallowed.
   */
  private async emitResponseSubmitted(
    surveyId: string,
    respondentId: string,
    responseId: string,
  ): Promise<void> {
    try {
      const meta = await this.dataSource.query(
        `SELECT u.email AS email,
                u.full_name AS "fullName",
                s.title AS "surveyTitle",
                rc.points_value AS "rewardPoints"
         FROM users u
         CROSS JOIN survey s
         LEFT JOIN survey_reward_config rc ON rc.survey_id = s.id
         WHERE u.id = $1 AND s.id = $2`,
        [respondentId, surveyId],
      );

      const row = meta?.[0] ?? {};
      const payload: ResponseSubmittedPayload = {
        surveyId,
        respondentId,
        responseId,
        respondentEmail: row.email ?? '',
        respondentName: row.fullName ?? '',
        surveyTitle: row.surveyTitle ?? '',
        submittedAt: new Date(),
        rewardPoints: row.rewardPoints != null ? Number(row.rewardPoints) : null,
      };

      this.eventEmitter.emit(EventType.RESPONSE_SUBMITTED, payload);
    } catch (error: any) {
      this.logger.error(
        `Failed to emit RESPONSE_SUBMITTED for response ${responseId}: ${error.message}`,
        error.stack,
      );
    }
  }

  private async findResponseById(id: string): Promise<SurveyResponse> {
    const response = await this.responseRepository.findOne({
      where: { id },
      relations: ['answers'],
    });

    if (!response) {
      throw new NotFoundException(`Response with id ${id} not found`);
    }

    return response;
  }

  /**
   * Save answers in batch (insert-only, for new responses).
   * Uses TypeORM bulk insert — single query for all answers.
   */
  private async saveAnswers(
    manager: EntityManager,
    responseId: string,
    answers: { questionId: string; value: any }[],
  ): Promise<void> {
    if (answers.length === 0) return;

    const answerEntities = answers.map((a) =>
      manager.create(Answer, {
        responseId,
        questionId: a.questionId,
        value: a.value,
        answeredAt: new Date(),
      }),
    );

    await manager.save(answerEntities);
  }

  /**
   * Upsert answers in batch using PostgreSQL's ON CONFLICT DO UPDATE.
   * Single query — dramatically faster than N queries for N answers.
   *
   * For a survey with 30 questions, this is 1 query vs 60 sequential queries.
   */
  private async upsertAnswers(
    manager: EntityManager,
    responseId: string,
    answers: { questionId: string; value: any }[],
  ): Promise<void> {
    if (answers.length === 0) return;

    const now = new Date();

    // Build PostgreSQL upsert query:
    // INSERT INTO answer (id, response_id, question_id, value, answered_at)
    // VALUES ($1, $2, $3, $4, $5), ($6, $7, $8, $9, $10), ...
    // ON CONFLICT (response_id, question_id)
    // DO UPDATE SET value = EXCLUDED.value, answered_at = EXCLUDED.answered_at

    const values = answers
      .map(
        (a, idx) =>
          `(uuid_generate_v4(), $${idx * 3 + 1}, $${idx * 3 + 2}, $${idx * 3 + 3}, $${answers.length * 3 + 1})`,
      )
      .join(', ');

    const params: any[] = [];
    for (const answer of answers) {
      params.push(responseId, answer.questionId, answer.value);
    }
    params.push(now); // answered_at — same for all rows

    const query = `
      INSERT INTO answer (id, response_id, question_id, value, answered_at)
      VALUES ${values}
      ON CONFLICT (response_id, question_id)
      DO UPDATE SET
        value = EXCLUDED.value,
        answered_at = EXCLUDED.answered_at
    `;

    await manager.query(query, params);
  }

  private applyFilters(
    qb: SelectQueryBuilder<SurveyResponse>,
    filters: ResponseFilterDto,
  ): void {
    // Date range filter
    if (filters.dateRange) {
      qb.andWhere('response.started_at >= :startDate', {
        startDate: new Date(filters.dateRange.start),
      });
      qb.andWhere('response.started_at <= :endDate', {
        endDate: new Date(filters.dateRange.end),
      });
    }

    // Region filter (matches respondent's profile city or province)
    if (filters.region) {
      qb.andWhere(
        '(profile.city ILIKE :region OR profile.province ILIKE :region)',
        { region: `%${filters.region}%` },
      );
    }

    // Profile attributes filter
    if (filters.profileAttributes) {
      if (filters.profileAttributes.age) {
        qb.andWhere('profile.age = :age', { age: filters.profileAttributes.age });
      }
      if (filters.profileAttributes.gender) {
        qb.andWhere('profile.gender = :gender', {
          gender: filters.profileAttributes.gender,
        });
      }
      if (filters.profileAttributes.occupation) {
        qb.andWhere('profile.occupation ILIKE :occupation', {
          occupation: `%${filters.profileAttributes.occupation}%`,
        });
      }
    }

    // Completion status filter
    if (filters.completionStatus) {
      qb.andWhere('response.status = :status', {
        status: filters.completionStatus,
      });
    }

    // Device type filter
    if (filters.deviceType) {
      qb.andWhere('response.device_type = :deviceType', {
        deviceType: filters.deviceType,
      });
    }

    // Tags filter (all specified tags must be present)
    if (filters.tags && filters.tags.length > 0) {
      qb.andWhere('response.tags @> :tags', {
        tags: JSON.stringify(filters.tags),
      });
    }
  }
}
