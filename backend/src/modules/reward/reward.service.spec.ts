import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { RewardService } from './reward.service';
import { PointTransaction, TransactionType } from './entities/point-transaction.entity';
import { RewardRedemption, RedemptionStatus } from './entities/reward-redemption.entity';
import { StreakTracker } from './entities/streak-tracker.entity';
import { User } from '@modules/auth/entities';
import { NotificationService } from '@modules/notification/notification.service';
import { NotificationFeedService } from '@modules/notification/notification-feed.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { REWARD_FULFILLMENT_PROVIDER } from './fulfillment';
import { PointCreditReason } from '@shared/enums';
import { POINT_VALUES, POINT_EXPIRATION_MONTHS } from './constants';

describe('RewardService', () => {
  let service: RewardService;
  let pointTransactionRepo: Repository<PointTransaction>;
  let redemptionRepo: Repository<RewardRedemption>;
  let streakTrackerRepo: Repository<StreakTracker>;
  let dataSourceMock: { transaction: ReturnType<typeof vi.fn> };

  const mockQueryBuilder = {
    select: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    getRawOne: vi.fn(),
    execute: vi.fn(),
  };

  beforeEach(async () => {
    // Repo mock diangkat ke variabel agar bisa dipakai ulang oleh manager transaksi.
    const ptRepoMock = {
      create: vi.fn((data) => ({ id: 'tx-1', ...data })),
      save: vi.fn((entity) => Promise.resolve({ id: 'tx-1', ...entity })),
      findOne: vi.fn().mockResolvedValue(null),
      findAndCount: vi.fn(),
      createQueryBuilder: vi.fn(() => mockQueryBuilder),
    };
    const rrRepoMock = {
      create: vi.fn((data) => ({ id: 'redemption-1', ...data })),
      save: vi.fn((entity) => Promise.resolve({ id: 'redemption-1', ...entity })),
      findOne: vi.fn(),
      findAndCount: vi.fn(),
      createQueryBuilder: vi.fn(() => mockQueryBuilder),
    };
    // dataSource.transaction(cb) → panggil cb dgn manager yang mengembalikan repo
    // mock yang SAMA (getRepository per-entity), agar assertion tetap berlaku.
    const managerMock = {
      getRepository: vi.fn((entity: unknown) => {
        if (entity === RewardRedemption) return rrRepoMock;
        if (entity === PointTransaction) return ptRepoMock;
        return undefined;
      }),
    };
    dataSourceMock = {
      transaction: vi.fn((cb: (m: typeof managerMock) => unknown) => cb(managerMock)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RewardService,
        {
          provide: getRepositoryToken(PointTransaction),
          useValue: ptRepoMock,
        },
        {
          provide: getRepositoryToken(RewardRedemption),
          useValue: rrRepoMock,
        },
        {
          provide: DataSource,
          useValue: dataSourceMock,
        },
        {
          provide: getRepositoryToken(StreakTracker),
          useValue: {
            create: vi.fn((data) => ({ id: 'streak-1', ...data })),
            save: vi.fn((entity) => Promise.resolve({ id: 'streak-1', ...entity })),
            findOne: vi.fn(),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: vi.fn().mockResolvedValue({
              id: 'user-1',
              email: 'user@example.com',
              fullName: 'Test User',
            }),
          },
        },
        {
          provide: NotificationService,
          useValue: { sendOtpEmail: vi.fn().mockResolvedValue(undefined) },
        },
        {
          provide: NotificationFeedService,
          useValue: { notifyUser: vi.fn().mockResolvedValue(undefined) },
        },
        {
          provide: EventEmitter2,
          useValue: { emit: vi.fn() },
        },
        {
          // Provider fulfillment default utk test: kembalikan 'pending'.
          provide: REWARD_FULFILLMENT_PROVIDER,
          useValue: {
            name: 'manual',
            fulfill: vi.fn().mockResolvedValue({ status: 'pending' }),
            parseCallback: vi.fn().mockReturnValue(null),
          },
        },
      ],
    }).compile();

    service = module.get<RewardService>(RewardService);
    pointTransactionRepo = module.get(getRepositoryToken(PointTransaction));
    redemptionRepo = module.get(getRepositoryToken(RewardRedemption));
    streakTrackerRepo = module.get(getRepositoryToken(StreakTracker));
  });

  describe('creditPoints', () => {
    it('should credit points with correct expiration date', async () => {
      await service.creditPoints('user-1', 1000, PointCreditReason.SURVEY_COMPLETION, 'survey-1');

      expect(pointTransactionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          amount: 1000,
          transactionType: TransactionType.CREDIT,
          reason: PointCreditReason.SURVEY_COMPLETION,
          referenceId: 'survey-1',
          expired: false,
        }),
      );

      // Verify expiration is set to 12 months from now
      const createCall = vi.mocked(pointTransactionRepo.create).mock.calls[0][0] as any;
      const earnedAt = new Date(createCall.earnedAt);
      const expiresAt = new Date(createCall.expiresAt);
      const monthsDiff =
        (expiresAt.getFullYear() - earnedAt.getFullYear()) * 12 +
        (expiresAt.getMonth() - earnedAt.getMonth());
      expect(monthsDiff).toBe(POINT_EXPIRATION_MONTHS);
    });

    it('should reject zero or negative amounts', async () => {
      await expect(
        service.creditPoints('user-1', 0, PointCreditReason.REGISTRATION),
      ).rejects.toThrow(BadRequestException);

      await expect(
        service.creditPoints('user-1', -100, PointCreditReason.REGISTRATION),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('creditRegistrationBonus', () => {
    it('should credit 500 points for registration', async () => {
      await service.creditRegistrationBonus('user-1');

      expect(pointTransactionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          amount: POINT_VALUES.REGISTRATION,
          reason: PointCreditReason.REGISTRATION,
        }),
      );
    });
  });

  describe('creditProfileCompletionBonus', () => {
    it('should credit 250 points for profile completion', async () => {
      await service.creditProfileCompletionBonus('user-1');

      expect(pointTransactionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          amount: POINT_VALUES.PROFILE_COMPLETION,
          reason: PointCreditReason.PROFILE_COMPLETION,
        }),
      );
    });
  });

  describe('creditSurveyCompletion', () => {
    it('should reject non-complete responses', async () => {
      await expect(
        service.creditSurveyCompletion('user-1', 'survey-1', 5000, 'in_progress'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should credit points with streak multiplier for complete responses', async () => {
      vi.mocked(streakTrackerRepo.findOne).mockResolvedValue({
        id: 'streak-1',
        userId: 'user-1',
        currentStreakDays: 7,
        lastCompletionDate: new Date(Date.now() - 86400000), // yesterday
        currentMultiplier: 1.5,
      } as StreakTracker);

      await service.creditSurveyCompletion('user-1', 'survey-1', 5000, 'complete');

      // 5000 * 1.5 = 7500
      expect(pointTransactionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          amount: 7500,
          reason: PointCreditReason.SURVEY_COMPLETION,
          referenceId: 'survey-1',
        }),
      );
    });

    it('idempoten: tidak mengkredit ulang bila sudah ada kredit untuk survei yang sama', async () => {
      const existingTx = {
        id: 'tx-existing',
        userId: 'user-1',
        amount: 7500,
        reason: PointCreditReason.SURVEY_COMPLETION,
        referenceId: 'survey-1',
      };
      vi.mocked(pointTransactionRepo.findOne).mockResolvedValue(existingTx as PointTransaction);

      const result = await service.creditSurveyCompletion('user-1', 'survey-1', 5000, 'complete');

      // Mengembalikan transaksi yang ada, TANPA membuat kredit baru / menyentuh streak.
      expect(result).toBe(existingTx);
      expect(pointTransactionRepo.create).not.toHaveBeenCalled();
      expect(streakTrackerRepo.findOne).not.toHaveBeenCalled();
    });
  });

  describe('calculateStreakMultiplier', () => {
    it('should return 1.0 for streak < 7 days', () => {
      expect(service.calculateStreakMultiplier(0)).toBe(1.0);
      expect(service.calculateStreakMultiplier(1)).toBe(1.0);
      expect(service.calculateStreakMultiplier(6)).toBe(1.0);
    });

    it('should return 1.5 for streak >= 7 and < 30 days', () => {
      expect(service.calculateStreakMultiplier(7)).toBe(1.5);
      expect(service.calculateStreakMultiplier(14)).toBe(1.5);
      expect(service.calculateStreakMultiplier(29)).toBe(1.5);
    });

    it('should return 2.0 for streak >= 30 days', () => {
      expect(service.calculateStreakMultiplier(30)).toBe(2.0);
      expect(service.calculateStreakMultiplier(60)).toBe(2.0);
      expect(service.calculateStreakMultiplier(100)).toBe(2.0);
    });
  });

  describe('updateStreak', () => {
    it('should create new streak tracker for first completion', async () => {
      vi.mocked(streakTrackerRepo.findOne).mockResolvedValue(null);

      const result = await service.updateStreak('user-1');

      expect(streakTrackerRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          currentStreakDays: 1,
          currentMultiplier: 1.0,
        }),
      );
      expect(result.currentStreakDays).toBe(1);
      expect(result.currentMultiplier).toBe(1.0);
    });

    it('should increment streak for consecutive day', async () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(0, 0, 0, 0);

      vi.mocked(streakTrackerRepo.findOne).mockResolvedValue({
        id: 'streak-1',
        userId: 'user-1',
        currentStreakDays: 6,
        lastCompletionDate: yesterday,
        currentMultiplier: 1.0,
      } as StreakTracker);

      const result = await service.updateStreak('user-1');

      expect(result.currentStreakDays).toBe(7);
      expect(result.currentMultiplier).toBe(1.5);
    });

    it('should reset streak if more than 1 day gap', async () => {
      const threeDaysAgo = new Date();
      threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
      threeDaysAgo.setHours(0, 0, 0, 0);

      vi.mocked(streakTrackerRepo.findOne).mockResolvedValue({
        id: 'streak-1',
        userId: 'user-1',
        currentStreakDays: 15,
        lastCompletionDate: threeDaysAgo,
        currentMultiplier: 1.5,
      } as StreakTracker);

      const result = await service.updateStreak('user-1');

      expect(result.currentStreakDays).toBe(1);
      expect(result.currentMultiplier).toBe(1.0);
    });
  });

  describe('getBalance', () => {
    it('should calculate balance correctly', async () => {
      // Mock total credits
      mockQueryBuilder.getRawOne
        .mockResolvedValueOnce({ total: '15000' }) // total credits
        .mockResolvedValueOnce({ total: '3000' }) // total debits
        .mockResolvedValueOnce({ total: '2000' }) // pending redemptions
        .mockResolvedValueOnce({ total: '5000' }); // expiring within 30 days

      const balance = await service.getBalance('user-1');

      expect(balance.total).toBe(12000); // 15000 - 3000
      expect(balance.available).toBe(10000); // 12000 - 2000
      expect(balance.pending).toBe(2000);
      expect(balance.expiringWithin30Days).toBe(5000);
    });
  });

  describe('processExpiredPoints', () => {
    it('should mark expired transactions', async () => {
      mockQueryBuilder.execute.mockResolvedValue({ affected: 5 });

      const result = await service.processExpiredPoints();

      expect(result.totalExpired).toBe(5);
      expect(result.transactionsAffected).toBe(5);
      expect(result.processedAt).toBeInstanceOf(Date);
    });
  });

  describe('getTransactionHistory', () => {
    it('should return paginated transaction history', async () => {
      const mockTransactions = [
        { id: 'tx-1', amount: 500, reason: 'registration' },
        { id: 'tx-2', amount: 1000, reason: 'survey_completion' },
      ];

      vi.mocked(pointTransactionRepo.findAndCount).mockResolvedValue([mockTransactions as any, 2]);

      const result = await service.getTransactionHistory('user-1', {
        page: 1,
        pageSize: 20,
      });

      expect(result.data).toHaveLength(2);
      expect(result.meta.total).toBe(2);
    });
  });

  describe('getRewardCatalog', () => {
    it('should return all rewards when no category specified', () => {
      const catalog = service.getRewardCatalog();
      expect(catalog.length).toBeGreaterThan(0);
    });

    it('should filter by category', () => {
      const pulsaCatalog = service.getRewardCatalog('pulsa');
      expect(pulsaCatalog.every((r) => r.category === 'pulsa')).toBe(true);
    });
  });

  describe('initiateRedemption', () => {
    it('should reject if reward not found', async () => {
      await expect(
        service.initiateRedemption('user-1', 'invalid-reward', '08123456789'),
      ).rejects.toThrow(NotFoundException);
    });

    it('should reject if balance below minimum threshold', async () => {
      // Ambang minimum penukaran = 500 poin; saldo 300 → ditolak.
      mockQueryBuilder.getRawOne
        .mockResolvedValueOnce({ total: '300' }) // credits
        .mockResolvedValueOnce({ total: '0' }) // debits
        .mockResolvedValueOnce({ total: '0' }) // pending
        .mockResolvedValueOnce({ total: '0' }); // expiring

      await expect(
        service.initiateRedemption('user-1', 'pulsa-5000', '08123456789'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject if balance insufficient for reward', async () => {
      // Saldo 2000 (di atas ambang 500) tapi pulsa-50000 kini berharga 5000 poin.
      mockQueryBuilder.getRawOne
        .mockResolvedValueOnce({ total: '2000' }) // credits
        .mockResolvedValueOnce({ total: '0' }) // debits
        .mockResolvedValueOnce({ total: '0' }) // pending
        .mockResolvedValueOnce({ total: '0' }); // expiring

      await expect(
        service.initiateRedemption('user-1', 'pulsa-50000', '08123456789'),
      ).rejects.toThrow(BadRequestException);
    });

    it('should create redemption and return OTP required', async () => {
      mockQueryBuilder.getRawOne
        .mockResolvedValueOnce({ total: '50000' }) // credits
        .mockResolvedValueOnce({ total: '0' }) // debits
        .mockResolvedValueOnce({ total: '0' }) // pending
        .mockResolvedValueOnce({ total: '0' }); // expiring

      const result = await service.initiateRedemption('user-1', 'pulsa-5000', '08123456789');

      expect(result.otpRequired).toBe(true);
      expect(result.status).toBe(RedemptionStatus.PENDING);
      expect(redemptionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          rewardType: 'pulsa-5000',
          pointsSpent: 500, // Rp 5.000 = 500 poin (1 poin = Rp 10)
          destinationNumber: '08123456789',
          status: RedemptionStatus.PENDING,
        }),
      );
    });
  });

  describe('confirmRedemption', () => {
    it('should reject if redemption not found', async () => {
      vi.mocked(redemptionRepo.findOne).mockResolvedValue(null);

      await expect(service.confirmRedemption('user-1', 'invalid-id', '123456')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should reject if OTP is invalid', async () => {
      vi.mocked(redemptionRepo.findOne).mockResolvedValue({
        id: 'redemption-1',
        userId: 'user-1',
        status: RedemptionStatus.PENDING,
        otpCode: '654321',
        otpExpiresAt: new Date(Date.now() + 600000),
        pointsSpent: 10000,
      } as RewardRedemption);

      await expect(service.confirmRedemption('user-1', 'redemption-1', '123456')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should reject if OTP is expired', async () => {
      vi.mocked(redemptionRepo.findOne).mockResolvedValue({
        id: 'redemption-1',
        userId: 'user-1',
        status: RedemptionStatus.PENDING,
        otpCode: '123456',
        otpExpiresAt: new Date(Date.now() - 600000), // expired
        pointsSpent: 10000,
      } as RewardRedemption);

      await expect(service.confirmRedemption('user-1', 'redemption-1', '123456')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should deduct points and update status on valid confirmation', async () => {
      vi.mocked(redemptionRepo.findOne).mockResolvedValue({
        id: 'redemption-1',
        userId: 'user-1',
        status: RedemptionStatus.PENDING,
        otpCode: '123456',
        otpExpiresAt: new Date(Date.now() + 600000),
        pointsSpent: 10000,
        rewardType: 'pulsa-5000',
        destinationNumber: '08123456789',
      } as RewardRedemption);

      // Mock balance check
      mockQueryBuilder.getRawOne
        .mockResolvedValueOnce({ total: '50000' }) // credits
        .mockResolvedValueOnce({ total: '0' }) // debits
        .mockResolvedValueOnce({ total: '0' }) // pending
        .mockResolvedValueOnce({ total: '0' }); // expiring

      const result = await service.confirmRedemption('user-1', 'redemption-1', '123456');

      expect(result.status).toBe(RedemptionStatus.PROCESSING);
      // Verify debit transaction was created
      expect(pointTransactionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          amount: 10000,
          transactionType: TransactionType.DEBIT,
          referenceId: 'redemption-1',
        }),
      );
    });

    it('regresi: penukaran senilai SELURUH saldo tidak boleh gagal (pending redemption ini sendiri jangan terhitung ganda)', async () => {
      vi.mocked(redemptionRepo.findOne).mockResolvedValue({
        id: 'redemption-1',
        userId: 'user-1',
        status: RedemptionStatus.PENDING,
        otpCode: '123456',
        otpExpiresAt: new Date(Date.now() + 600000),
        pointsSpent: 500,
        rewardType: 'pulsa-5000',
        destinationNumber: '08123456789',
      } as RewardRedemption);

      // Saldo persis 500; redemption ini (masih PENDING) muncul sbg pending=500.
      // Kode lama: available = 500 - 500 = 0 → 0 < 500 → FAILED (bug).
      mockQueryBuilder.getRawOne
        .mockResolvedValueOnce({ total: '500' }) // credits
        .mockResolvedValueOnce({ total: '0' }) // debits
        .mockResolvedValueOnce({ total: '500' }) // pending (redemption ini sendiri)
        .mockResolvedValueOnce({ total: '0' }); // expiring

      const result = await service.confirmRedemption('user-1', 'redemption-1', '123456');

      expect(result.status).toBe(RedemptionStatus.PROCESSING);
      expect(pointTransactionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          amount: 500,
          transactionType: TransactionType.DEBIT,
          referenceId: 'redemption-1',
        }),
      );
    });

    it('debit + klaim status berjalan dalam transaksi DB (anti double-spend)', async () => {
      vi.mocked(redemptionRepo.findOne).mockResolvedValue({
        id: 'redemption-1',
        userId: 'user-1',
        status: RedemptionStatus.PENDING,
        otpCode: '123456',
        otpExpiresAt: new Date(Date.now() + 600000),
        pointsSpent: 500,
        rewardType: 'pulsa-5000',
        destinationNumber: '08123456789',
      } as RewardRedemption);
      mockQueryBuilder.getRawOne
        .mockResolvedValueOnce({ total: '5000' })
        .mockResolvedValueOnce({ total: '0' })
        .mockResolvedValueOnce({ total: '500' })
        .mockResolvedValueOnce({ total: '0' });

      await service.confirmRedemption('user-1', 'redemption-1', '123456');

      // Lock + debit + update status HARUS di dalam satu transaksi.
      expect(dataSourceMock.transaction).toHaveBeenCalledTimes(1);
      // findOne dipanggil dengan pessimistic write lock.
      expect(redemptionRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ lock: { mode: 'pessimistic_write' } }),
      );
    });

    it('OTP salah menaikkan percobaan; setelah batas maks → penukaran FAILED', async () => {
      // otpAttempts sudah 4; percobaan salah ke-5 (MAX_REDEMPTION_OTP_ATTEMPTS=5) → FAILED.
      const redemption = {
        id: 'redemption-1',
        userId: 'user-1',
        status: RedemptionStatus.PENDING,
        otpCode: '654321',
        otpExpiresAt: new Date(Date.now() + 600000),
        pointsSpent: 500,
        otpAttempts: 4,
      } as RewardRedemption;
      vi.mocked(redemptionRepo.findOne).mockResolvedValue(redemption);

      await expect(service.confirmRedemption('user-1', 'redemption-1', '000000')).rejects.toThrow(
        BadRequestException,
      );

      // Poin TIDAK terpotong saat OTP gagal.
      expect(pointTransactionRepo.create).not.toHaveBeenCalled();
      // Redemption ditandai FAILED setelah melewati batas percobaan.
      expect(redemptionRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: RedemptionStatus.FAILED, otpAttempts: 5 }),
      );
    });
  });

  describe('manualCreditPoints', () => {
    it('should credit points with manual_credit reason', async () => {
      await service.manualCreditPoints('admin-1', 'user-1', 5000, 'Bonus khusus');

      expect(pointTransactionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          amount: 5000,
          reason: PointCreditReason.MANUAL_CREDIT,
        }),
      );
    });
  });
});
