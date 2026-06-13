import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { randomInt } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PointTransaction, TransactionType } from './entities/point-transaction.entity';
import { RewardRedemption, RedemptionStatus } from './entities/reward-redemption.entity';
import { StreakTracker } from './entities/streak-tracker.entity';
import { PointCreditReason } from '@shared/enums';
import {
  PointBalance,
  StreakInfo,
  RewardItem,
  RedemptionResult,
  ExpiredPointsSummary,
} from './interfaces';
import {
  REWARD_CATALOG,
  MINIMUM_REDEMPTION_THRESHOLD,
  POINT_VALUES,
  STREAK_MULTIPLIERS,
  POINT_EXPIRATION_MONTHS,
  REDEMPTION_OTP_TTL_MINUTES,
} from './constants';
import {
  createPaginatedResponse,
  calculateSkipTake,
} from '@shared/helpers/pagination.helper';
import { PaginatedResponse, PaginationQuery } from '@shared/interfaces';
import { CircuitBreaker } from '@shared/circuit-breaker';

@Injectable()
export class RewardService {
  private readonly logger = new Logger(RewardService.name);
  private readonly fulfillmentCircuitBreaker: CircuitBreaker;

  constructor(
    @InjectRepository(PointTransaction)
    private readonly pointTransactionRepository: Repository<PointTransaction>,
    @InjectRepository(RewardRedemption)
    private readonly redemptionRepository: Repository<RewardRedemption>,
    @InjectRepository(StreakTracker)
    private readonly streakTrackerRepository: Repository<StreakTracker>,
  ) {
    this.fulfillmentCircuitBreaker = new CircuitBreaker({
      name: 'reward-fulfillment',
      failureThreshold: 5,
      successThreshold: 3,
      timeout: 30000,
    });
  }

  // ─── Point Crediting ───────────────────────────────────────────────────────

  /**
   * Credit points to a user for a specific reason.
   * Sets expiration to 12 months from earned_at.
   */
  async creditPoints(
    userId: string,
    amount: number,
    reason: PointCreditReason,
    referenceId?: string,
  ): Promise<PointTransaction> {
    if (amount <= 0) {
      throw new BadRequestException('Amount must be greater than 0');
    }

    const earnedAt = new Date();
    const expiresAt = new Date(earnedAt);
    expiresAt.setMonth(expiresAt.getMonth() + POINT_EXPIRATION_MONTHS);

    const transaction = this.pointTransactionRepository.create({
      userId,
      amount,
      transactionType: TransactionType.CREDIT,
      reason,
      referenceId: referenceId || null,
      earnedAt,
      expiresAt,
      expired: false,
    });

    const saved = await this.pointTransactionRepository.save(transaction);

    this.logger.log(
      `Points credited: userId=${userId}, amount=${amount}, reason=${reason}, referenceId=${referenceId || 'none'}`,
    );

    return saved;
  }

  /**
   * Credit registration bonus points (500 points).
   */
  async creditRegistrationBonus(userId: string): Promise<PointTransaction> {
    return this.creditPoints(
      userId,
      POINT_VALUES.REGISTRATION,
      PointCreditReason.REGISTRATION,
    );
  }

  /**
   * Credit profile completion bonus points (250 points).
   */
  async creditProfileCompletionBonus(userId: string): Promise<PointTransaction> {
    return this.creditPoints(
      userId,
      POINT_VALUES.PROFILE_COMPLETION,
      PointCreditReason.PROFILE_COMPLETION,
    );
  }

  /**
   * Credit survey completion points.
   * Validates that the response is complete before crediting.
   * Applies streak multiplier if applicable.
   */
  async creditSurveyCompletion(
    userId: string,
    surveyId: string,
    basePoints: number,
    responseStatus: string,
  ): Promise<PointTransaction> {
    // Only credit points for complete responses
    if (responseStatus !== 'complete') {
      throw new BadRequestException(
        'Points can only be credited for complete survey responses',
      );
    }

    // Idempotensi: satu responden hanya boleh dikreditkan SEKALI per survei.
    // Mencegah poin (dan streak) dobel bila event RESPONSE_SUBMITTED terkirim
    // atau diproses ulang. Pengecekan ini dijalankan SEBELUM updateStreak.
    const existing = await this.findSurveyCompletionCredit(userId, surveyId);
    if (existing) {
      this.logger.warn(
        `Survey completion sudah dikreditkan (idempotent skip): userId=${userId}, surveyId=${surveyId}`,
      );
      return existing;
    }

    // Update streak and get multiplier
    const streakInfo = await this.updateStreak(userId);
    const finalPoints = Math.floor(basePoints * streakInfo.currentMultiplier);

    try {
      const transaction = await this.creditPoints(
        userId,
        finalPoints,
        PointCreditReason.SURVEY_COMPLETION,
        surveyId,
      );

      // If streak bonus was applied, log it
      if (streakInfo.currentMultiplier > 1.0) {
        this.logger.log(
          `Streak multiplier applied: userId=${userId}, base=${basePoints}, multiplier=${streakInfo.currentMultiplier}, final=${finalPoints}`,
        );
      }

      return transaction;
    } catch (error: any) {
      // Race: dua proses melewati pengecekan bersamaan; unique index parsial
      // (uq_point_tx_survey_completion) menolak duplikat — kembalikan yang ada.
      if (error?.code === '23505') {
        const raced = await this.findSurveyCompletionCredit(userId, surveyId);
        if (raced) return raced;
      }
      throw error;
    }
  }

  /** Cari kredit penyelesaian survei yang sudah ada untuk (user, survei). */
  private findSurveyCompletionCredit(
    userId: string,
    surveyId: string,
  ): Promise<PointTransaction | null> {
    return this.pointTransactionRepository.findOne({
      where: {
        userId,
        reason: PointCreditReason.SURVEY_COMPLETION,
        referenceId: surveyId,
      },
    });
  }

  /**
   * Manually credit points to a user (admin action).
   */
  async manualCreditPoints(
    adminId: string,
    respondentId: string,
    amount: number,
    reason: string,
  ): Promise<PointTransaction> {
    const transaction = await this.creditPoints(
      respondentId,
      amount,
      PointCreditReason.MANUAL_CREDIT,
    );

    this.logger.log(
      `[AUDIT] Manual credit: adminId=${adminId}, respondentId=${respondentId}, amount=${amount}, reason=${reason}`,
    );

    return transaction;
  }

  // ─── Streak Tracking ──────────────────────────────────────────────────────

  /**
   * Calculate the streak multiplier based on current streak days.
   * >= 30 days → 2.0x
   * >= 7 days → 1.5x
   * < 7 days → 1.0x
   */
  calculateStreakMultiplier(streakDays: number): number {
    if (streakDays >= STREAK_MULTIPLIERS.DAYS_30.days) {
      return STREAK_MULTIPLIERS.DAYS_30.multiplier;
    }
    if (streakDays >= STREAK_MULTIPLIERS.DAYS_7.days) {
      return STREAK_MULTIPLIERS.DAYS_7.multiplier;
    }
    return 1.0;
  }

  /**
   * Update streak for a user after completing a survey.
   * Returns the current streak info with multiplier.
   */
  async updateStreak(userId: string): Promise<StreakInfo> {
    let tracker = await this.streakTrackerRepository.findOne({
      where: { userId },
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (!tracker) {
      // First completion ever
      tracker = this.streakTrackerRepository.create({
        userId,
        currentStreakDays: 1,
        lastCompletionDate: today,
        currentMultiplier: 1.0,
      });
    } else {
      const lastDate = tracker.lastCompletionDate
        ? new Date(tracker.lastCompletionDate)
        : null;

      if (lastDate) {
        lastDate.setHours(0, 0, 0, 0);
        const diffMs = today.getTime() - lastDate.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (diffDays === 0) {
          // Already completed today, no streak change
        } else if (diffDays === 1) {
          // Consecutive day
          tracker.currentStreakDays += 1;
        } else {
          // Streak broken
          tracker.currentStreakDays = 1;
        }
      } else {
        tracker.currentStreakDays = 1;
      }

      tracker.lastCompletionDate = today;
    }

    tracker.currentMultiplier = this.calculateStreakMultiplier(tracker.currentStreakDays);
    const saved = await this.streakTrackerRepository.save(tracker);

    return {
      currentStreakDays: saved.currentStreakDays,
      currentMultiplier: Number(saved.currentMultiplier),
      lastCompletionDate: saved.lastCompletionDate,
    };
  }

  /**
   * Get current streak info for a user.
   */
  async getStreakInfo(userId: string): Promise<StreakInfo> {
    const tracker = await this.streakTrackerRepository.findOne({
      where: { userId },
    });

    if (!tracker) {
      return {
        currentStreakDays: 0,
        currentMultiplier: 1.0,
        lastCompletionDate: null,
      };
    }

    return {
      currentStreakDays: tracker.currentStreakDays,
      currentMultiplier: Number(tracker.currentMultiplier),
      lastCompletionDate: tracker.lastCompletionDate,
    };
  }

  // ─── Balance Management ───────────────────────────────────────────────────

  /**
   * Get the point balance for a user.
   * Calculates total, available, pending (in redemption), and expiring within 30 days.
   */
  async getBalance(userId: string): Promise<PointBalance> {
    const now = new Date();
    const thirtyDaysFromNow = new Date(now);
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);

    // Total credits (non-expired)
    const totalCreditsResult = await this.pointTransactionRepository
      .createQueryBuilder('pt')
      .select('COALESCE(SUM(pt.amount), 0)', 'total')
      .where('pt.user_id = :userId', { userId })
      .andWhere('pt.transaction_type = :type', { type: TransactionType.CREDIT })
      .andWhere('pt.expired = false')
      .getRawOne();

    const totalCredits = parseInt(totalCreditsResult?.total || '0', 10);

    // Total debits
    const totalDebitsResult = await this.pointTransactionRepository
      .createQueryBuilder('pt')
      .select('COALESCE(SUM(pt.amount), 0)', 'total')
      .where('pt.user_id = :userId', { userId })
      .andWhere('pt.transaction_type = :type', { type: TransactionType.DEBIT })
      .getRawOne();

    const totalDebits = parseInt(totalDebitsResult?.total || '0', 10);

    // Pending redemptions (points locked in pending/processing redemptions)
    const pendingResult = await this.redemptionRepository
      .createQueryBuilder('rr')
      .select('COALESCE(SUM(rr.points_spent), 0)', 'total')
      .where('rr.user_id = :userId', { userId })
      .andWhere('rr.status IN (:...statuses)', {
        statuses: [RedemptionStatus.PENDING, RedemptionStatus.PROCESSING],
      })
      .getRawOne();

    const pending = parseInt(pendingResult?.total || '0', 10);

    // Points expiring within 30 days
    const expiringResult = await this.pointTransactionRepository
      .createQueryBuilder('pt')
      .select('COALESCE(SUM(pt.amount), 0)', 'total')
      .where('pt.user_id = :userId', { userId })
      .andWhere('pt.transaction_type = :type', { type: TransactionType.CREDIT })
      .andWhere('pt.expired = false')
      .andWhere('pt.expires_at IS NOT NULL')
      .andWhere('pt.expires_at <= :thirtyDays', { thirtyDays: thirtyDaysFromNow })
      .andWhere('pt.expires_at > :now', { now })
      .getRawOne();

    const expiringWithin30Days = parseInt(expiringResult?.total || '0', 10);

    const total = totalCredits - totalDebits;
    const available = total - pending;

    return {
      total: Math.max(0, total),
      available: Math.max(0, available),
      pending,
      expiringWithin30Days,
    };
  }

  /**
   * Process expired points. Marks point transactions as expired
   * when their expires_at date has passed.
   * Runs as a scheduled cron job daily at midnight.
   */
  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async processExpiredPoints(): Promise<ExpiredPointsSummary> {
    const now = new Date();

    const result = await this.pointTransactionRepository
      .createQueryBuilder()
      .update(PointTransaction)
      .set({ expired: true })
      .where('expired = false')
      .andWhere('expires_at IS NOT NULL')
      .andWhere('expires_at <= :now', { now })
      .andWhere('transaction_type = :type', { type: TransactionType.CREDIT })
      .execute();

    const summary: ExpiredPointsSummary = {
      totalExpired: result.affected || 0,
      transactionsAffected: result.affected || 0,
      processedAt: now,
    };

    if (summary.totalExpired > 0) {
      this.logger.log(
        `Expired points processed: ${summary.totalExpired} transactions marked as expired`,
      );
    }

    return summary;
  }

  /**
   * Get transaction history for a user with pagination.
   */
  async getTransactionHistory(
    userId: string,
    pagination: PaginationQuery,
  ): Promise<PaginatedResponse<PointTransaction>> {
    const { skip, take } = calculateSkipTake(pagination);

    const [data, total] = await this.pointTransactionRepository.findAndCount({
      where: { userId },
      order: { earnedAt: 'DESC' },
      skip,
      take,
    });

    return createPaginatedResponse(data, total, pagination);
  }

  // ─── Redemption Flow ──────────────────────────────────────────────────────

  /**
   * Get the reward catalog with all available rewards.
   * Optionally filter by category.
   */
  getRewardCatalog(category?: string): RewardItem[] {
    if (category) {
      return REWARD_CATALOG.filter((item) => item.category === category);
    }
    return REWARD_CATALOG;
  }

  /**
   * Initiate a redemption request.
   * Validates minimum threshold (10,000 points) and sufficient balance.
   * Generates OTP for confirmation.
   */
  async initiateRedemption(
    userId: string,
    rewardId: string,
    destinationNumber: string,
  ): Promise<RedemptionResult> {
    // Find reward in catalog
    const reward = REWARD_CATALOG.find((r) => r.id === rewardId);
    if (!reward) {
      throw new NotFoundException('Reward not found in catalog');
    }

    // Check balance
    const balance = await this.getBalance(userId);

    // Check minimum threshold
    if (balance.available < MINIMUM_REDEMPTION_THRESHOLD) {
      throw new BadRequestException(
        `Saldo tidak mencukupi. Minimum penukaran adalah ${MINIMUM_REDEMPTION_THRESHOLD.toLocaleString()} poin.`,
      );
    }

    // Check sufficient balance for this reward
    if (balance.available < reward.pointsCost) {
      throw new BadRequestException(
        `Saldo tidak mencukupi. Reward ini membutuhkan ${reward.pointsCost.toLocaleString()} poin, saldo tersedia: ${balance.available.toLocaleString()} poin.`,
      );
    }

    // Generate OTP
    const otpCode = this.generateOtpCode();
    const otpExpiresAt = new Date();
    otpExpiresAt.setMinutes(otpExpiresAt.getMinutes() + REDEMPTION_OTP_TTL_MINUTES);

    // Create redemption record
    const redemption = this.redemptionRepository.create({
      userId,
      rewardType: reward.id,
      pointsSpent: reward.pointsCost,
      destinationNumber,
      status: RedemptionStatus.PENDING,
      otpCode,
      otpExpiresAt,
    });

    const saved = await this.redemptionRepository.save(redemption);

    // In production, send OTP via email/SMS through NotificationService
    // OTP code is intentionally NOT logged to prevent credential leakage
    this.logger.log(
      `[NOTIFICATION] Redemption OTP issued: userId=${userId}, redemptionId=${saved.id}`,
    );

    return {
      redemptionId: saved.id,
      status: saved.status,
      message: 'Kode OTP telah dikirim. Silakan konfirmasi penukaran.',
      otpRequired: true,
    };
  }

  /**
   * Confirm a redemption with OTP verification.
   * Deducts points from balance after successful confirmation.
   * Triggers notification email.
   */
  async confirmRedemption(
    userId: string,
    redemptionId: string,
    otpCode: string,
  ): Promise<RedemptionResult> {
    const redemption = await this.redemptionRepository.findOne({
      where: { id: redemptionId, userId },
    });

    if (!redemption) {
      throw new NotFoundException('Redemption request not found');
    }

    if (redemption.status !== RedemptionStatus.PENDING) {
      throw new BadRequestException('Redemption is no longer in pending status');
    }

    // Validate OTP
    if (!redemption.otpCode || redemption.otpCode !== otpCode) {
      throw new BadRequestException('Kode OTP tidak valid');
    }

    // Check OTP expiration
    if (redemption.otpExpiresAt && new Date() > redemption.otpExpiresAt) {
      throw new BadRequestException('Kode OTP telah kadaluarsa');
    }

    // Re-check balance (in case points expired between initiation and confirmation)
    const balance = await this.getBalance(userId);
    if (balance.available < redemption.pointsSpent) {
      redemption.status = RedemptionStatus.FAILED;
      await this.redemptionRepository.save(redemption);
      throw new BadRequestException(
        'Saldo tidak mencukupi. Poin mungkin telah kadaluarsa.',
      );
    }

    // Deduct points (create debit transaction)
    const debitTransaction = this.pointTransactionRepository.create({
      userId,
      amount: redemption.pointsSpent,
      transactionType: TransactionType.DEBIT,
      reason: PointCreditReason.MANUAL_CREDIT, // Using as generic debit reason
      referenceId: redemption.id,
      earnedAt: new Date(),
      expiresAt: null,
      expired: false,
    });
    await this.pointTransactionRepository.save(debitTransaction);

    // Update redemption status
    redemption.status = RedemptionStatus.PROCESSING;
    redemption.processedAt = new Date();
    redemption.otpCode = null; // Clear OTP after use
    await this.redemptionRepository.save(redemption);

    // Trigger notification
    this.logger.log(
      `[NOTIFICATION] Redemption confirmed: userId=${userId}, redemptionId=${redemptionId}, points=${redemption.pointsSpent}`,
    );
    this.logger.log(
      `[AUDIT] Reward redemption: userId=${userId}, rewardType=${redemption.rewardType}, points=${redemption.pointsSpent}, destination=${redemption.destinationNumber}`,
    );

    return {
      redemptionId: redemption.id,
      status: redemption.status,
      message: 'Penukaran berhasil dikonfirmasi. Reward sedang diproses.',
    };
  }

  /**
   * Get redemption history for a user.
   */
  async getRedemptionHistory(
    userId: string,
    pagination: PaginationQuery,
  ): Promise<PaginatedResponse<RewardRedemption>> {
    const { skip, take } = calculateSkipTake(pagination);

    const [data, total] = await this.redemptionRepository.findAndCount({
      where: { userId },
      order: { requestedAt: 'DESC' },
      skip,
      take,
    });

    return createPaginatedResponse(data, total, pagination);
  }

  /**
   * Fulfill a reward through external service (e.g., pulsa top-up, e-wallet transfer).
   * Protected by circuit breaker to handle external service failures gracefully.
   */
  async fulfillReward(redemptionId: string): Promise<{ success: boolean; message: string }> {
    const fallback = { success: false, message: 'Reward fulfillment service temporarily unavailable. Will retry later.' };

    return this.fulfillmentCircuitBreaker.execute(
      async () => {
        // In production, this would call an external API (e.g., pulsa provider, e-wallet API)
        this.logger.log(`Fulfilling reward for redemption: ${redemptionId}`);

        // Simulate external API call
        await new Promise((resolve) => setTimeout(resolve, 200));

        // Update redemption status to completed
        const redemption = await this.redemptionRepository.findOne({
          where: { id: redemptionId },
        });

        if (redemption && redemption.status === RedemptionStatus.PROCESSING) {
          redemption.status = RedemptionStatus.COMPLETED;
          await this.redemptionRepository.save(redemption);
        }

        return { success: true, message: 'Reward fulfilled successfully' };
      },
      fallback,
    );
  }

  // ─── Private Helpers ──────────────────────────────────────────────────────

  private generateOtpCode(): string {
    // Use cryptographically secure RNG — Math.random() is NOT suitable for OTPs
    // randomInt(min, max) returns integer in [min, max) — guarantees exactly 6 digits
    return randomInt(100000, 1000000).toString();
  }
}
