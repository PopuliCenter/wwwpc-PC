import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SurveyTimeConfig } from '../entities/survey-time-config.entity';
import { SurveyAccessResultDto } from '../dto/survey-access-result.dto';

@Injectable()
export class SurveyTimeService {
  private readonly logger = new Logger(SurveyTimeService.name);

  constructor(
    @InjectRepository(SurveyTimeConfig)
    private readonly timeConfigRepository: Repository<SurveyTimeConfig>,
  ) {}

  /**
   * Checks if a survey is currently accessible for respondents.
   * Returns error if:
   * - Current time is before start_datetime
   * - Current time is after end_datetime
   * - Max respondents reached
   */
  async checkSurveyAccess(surveyId: string): Promise<SurveyAccessResultDto> {
    const timeConfig = await this.getTimeConfig(surveyId);
    const now = new Date();

    if (timeConfig.startDatetime && now < timeConfig.startDatetime) {
      return {
        allowed: false,
        reason: 'Survey has not started yet',
      };
    }

    if (timeConfig.endDatetime && now > timeConfig.endDatetime) {
      return {
        allowed: false,
        reason: 'Survey has ended',
      };
    }

    if (
      timeConfig.maxRespondents !== null &&
      timeConfig.currentRespondentCount >= timeConfig.maxRespondents
    ) {
      return {
        allowed: false,
        reason: 'Maximum number of respondents reached',
      };
    }

    return { allowed: true };
  }

  /**
   * Checks if a submission is allowed for the survey.
   * Returns error if:
   * - Current time is after end_datetime
   * - Max respondents reached
   */
  async checkSubmissionAllowed(surveyId: string): Promise<SurveyAccessResultDto> {
    const timeConfig = await this.getTimeConfig(surveyId);
    const now = new Date();

    if (timeConfig.endDatetime && now > timeConfig.endDatetime) {
      return {
        allowed: false,
        reason: 'Survey has ended, submissions are no longer accepted',
      };
    }

    if (
      timeConfig.maxRespondents !== null &&
      timeConfig.currentRespondentCount >= timeConfig.maxRespondents
    ) {
      return {
        allowed: false,
        reason: 'Maximum number of respondents reached',
      };
    }

    return { allowed: true };
  }

  /**
   * Atomically increments the current respondent count for a survey.
   * Uses a single `SET count = count + 1` statement so concurrent submissions
   * cannot lose updates (avoids the read-modify-write race condition).
   */
  async incrementRespondentCount(surveyId: string): Promise<void> {
    const result = await this.timeConfigRepository
      .createQueryBuilder()
      .update(SurveyTimeConfig)
      .set({ currentRespondentCount: () => 'current_respondent_count + 1' })
      .where('survey_id = :surveyId', { surveyId })
      .execute();

    if (!result.affected) {
      throw new NotFoundException(`Time configuration for survey ${surveyId} not found`);
    }

    this.logger.log(`Respondent count incremented for survey ${surveyId}`);
  }

  /**
   * Atomically decrements the respondent count, never below 0. Best-effort:
   * tidak melempar bila time config tak ada — dipakai saat admin menghapus
   * respons agar kuota (maxRespondents) kembali bebas.
   */
  async decrementRespondentCount(surveyId: string): Promise<void> {
    await this.timeConfigRepository
      .createQueryBuilder()
      .update(SurveyTimeConfig)
      .set({
        currentRespondentCount: () => 'GREATEST(current_respondent_count - 1, 0)',
      })
      .where('survey_id = :surveyId', { surveyId })
      .execute();

    this.logger.log(`Respondent count decremented for survey ${surveyId}`);
  }

  /**
   * Calculates remaining time in seconds based on max_duration_minutes and when the respondent started.
   * Returns null if no max duration is configured.
   */
  getRemainingTime(maxDurationMinutes: number | null, startedAt: Date): number | null {
    if (maxDurationMinutes === null) {
      return null;
    }

    const now = new Date();
    const elapsedMs = now.getTime() - startedAt.getTime();
    const maxDurationMs = maxDurationMinutes * 60 * 1000;
    const remainingMs = maxDurationMs - elapsedMs;

    return Math.max(0, Math.floor(remainingMs / 1000));
  }

  /**
   * Checks if the max duration has been exceeded for a respondent's session.
   * Returns true if timer has expired.
   *
   * `graceSeconds` memberi kelonggaran kecil saat SUBMIT: auto-submit di klien
   * dipicu tepat saat timer mencapai 0, sehingga tanpa grace, drift + latensi
   * jaringan membuat elapsed sedikit melebihi batas dan pengiriman terakhir yang
   * sah justru ditolak (jawaban hilang persis di detik penyelamatan). Tidak
   * dipakai untuk getRemainingTime (tampilan) agar hitung mundur tetap akurat.
   */
  isTimerExpired(
    maxDurationMinutes: number | null,
    startedAt: Date,
    graceSeconds = 0,
  ): boolean {
    if (maxDurationMinutes === null) {
      return false;
    }

    const now = new Date();
    const elapsedMs = now.getTime() - startedAt.getTime();
    const maxDurationMs = maxDurationMinutes * 60 * 1000 + graceSeconds * 1000;

    return elapsedMs >= maxDurationMs;
  }

  /**
   * Gets the time config for a survey, with survey-level fallback.
   */
  async getTimeConfig(surveyId: string): Promise<SurveyTimeConfig> {
    const timeConfig = await this.timeConfigRepository.findOne({
      where: { surveyId },
    });

    if (!timeConfig) {
      throw new NotFoundException(`Time configuration for survey ${surveyId} not found`);
    }

    return timeConfig;
  }
}
