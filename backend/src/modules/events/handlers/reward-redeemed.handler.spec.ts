import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RewardRedeemedHandler } from './reward-redeemed.handler';
import { RewardRedeemedPayload } from '../event-types';

describe('RewardRedeemedHandler', () => {
  let handler: RewardRedeemedHandler;
  let mockNotificationService: any;
  let mockAuditService: any;

  const payload: RewardRedeemedPayload = {
    userId: 'user-1',
    email: 'user@example.com',
    fullName: 'Test User',
    redemptionId: 'redemption-1',
    rewardType: 'pulsa_50k',
    pointsSpent: 10000,
    destinationNumber: '08123456789',
    remainingBalance: 5000,
  };

  beforeEach(() => {
    mockNotificationService = {
      sendRedemptionConfirmation: vi.fn().mockResolvedValue(undefined),
    };
    mockAuditService = {
      log: vi.fn().mockResolvedValue(undefined),
    };

    handler = new RewardRedeemedHandler(mockNotificationService, mockAuditService);
  });

  describe('handleNotification', () => {
    it('should send redemption confirmation email', async () => {
      await handler.handleNotification(payload);

      expect(mockNotificationService.sendRedemptionConfirmation).toHaveBeenCalledWith(
        { email: 'user@example.com', fullName: 'Test User' },
        {
          rewardType: 'pulsa_50k',
          pointsSpent: 10000,
          destinationNumber: '08123456789',
          remainingBalance: 5000,
        },
      );
    });

    it('should not throw when notification service fails', async () => {
      mockNotificationService.sendRedemptionConfirmation.mockRejectedValue(
        new Error('Queue error'),
      );

      await expect(handler.handleNotification(payload)).resolves.not.toThrow();
    });
  });

  describe('handleAuditLog', () => {
    it('should log audit event for redemption', async () => {
      await handler.handleAuditLog(payload);

      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          module: 'reward',
          details: expect.objectContaining({
            redemptionId: 'redemption-1',
            rewardType: 'pulsa_50k',
            pointsSpent: 10000,
          }),
        }),
      );
    });

    it('should not throw when audit service fails', async () => {
      mockAuditService.log.mockRejectedValue(new Error('Audit error'));

      await expect(handler.handleAuditLog(payload)).resolves.not.toThrow();
    });
  });
});
