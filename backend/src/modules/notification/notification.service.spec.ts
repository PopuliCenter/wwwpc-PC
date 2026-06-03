import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bull';
import { NotificationService } from './notification.service';
import { NOTIFICATION_QUEUE, EMAIL_JOB, BULK_EMAIL_JOB, EMAIL_RETRY_ATTEMPTS, EMAIL_RETRY_DELAY, POINTS_THRESHOLD } from './constants';
import { EmailTemplate } from './interfaces';

describe('NotificationService', () => {
  let service: NotificationService;
  let mockQueue: any;

  beforeEach(async () => {
    mockQueue = {
      add: vi.fn().mockResolvedValue({ id: 'job-1' }),
      getWaitingCount: vi.fn().mockResolvedValue(5),
      getActiveCount: vi.fn().mockResolvedValue(2),
      getCompletedCount: vi.fn().mockResolvedValue(100),
      getFailedCount: vi.fn().mockResolvedValue(3),
      getDelayedCount: vi.fn().mockResolvedValue(1),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationService,
        {
          provide: getQueueToken(NOTIFICATION_QUEUE),
          useValue: mockQueue,
        },
      ],
    }).compile();

    service = module.get<NotificationService>(NotificationService);
  });

  describe('sendSurveyInvitation', () => {
    it('should queue bulk email jobs for survey invitations', async () => {
      const respondents = [
        { email: 'user1@test.com', fullName: 'User One' },
        { email: 'user2@test.com', fullName: 'User Two' },
      ];
      const survey = {
        title: 'Test Survey',
        description: 'A test survey',
        endDatetime: '2026-06-01',
        id: 'survey-1',
      };

      await service.sendSurveyInvitation(respondents, survey, 'https://app.test');

      expect(mockQueue.add).toHaveBeenCalledWith(
        BULK_EMAIL_JOB,
        expect.objectContaining({
          payloads: expect.arrayContaining([
            expect.objectContaining({
              to: 'user1@test.com',
              template: EmailTemplate.SURVEY_INVITATION,
            }),
            expect.objectContaining({
              to: 'user2@test.com',
              template: EmailTemplate.SURVEY_INVITATION,
            }),
          ]),
          batchId: expect.any(String),
        }),
        expect.objectContaining({
          attempts: EMAIL_RETRY_ATTEMPTS,
          backoff: { type: 'exponential', delay: EMAIL_RETRY_DELAY },
        }),
      );
    });

    it('should batch large recipient lists into groups of 50', async () => {
      const respondents = Array.from({ length: 120 }, (_, i) => ({
        email: `user${i}@test.com`,
        fullName: `User ${i}`,
      }));
      const survey = { title: 'Big Survey', endDatetime: '2026-06-01', id: 'survey-2' };

      await service.sendSurveyInvitation(respondents, survey, 'https://app.test');

      // 120 recipients / 50 per batch = 3 batches
      expect(mockQueue.add).toHaveBeenCalledTimes(3);
    });
  });

  describe('sendReminder', () => {
    it('should queue H-3 reminder emails', async () => {
      const respondents = [{ email: 'user@test.com', fullName: 'User' }];
      const survey = { title: 'Survey', endDatetime: '2026-06-01', id: 'survey-1' };

      await service.sendReminder(respondents, survey, 3, 'https://app.test');

      expect(mockQueue.add).toHaveBeenCalledWith(
        BULK_EMAIL_JOB,
        expect.objectContaining({
          payloads: expect.arrayContaining([
            expect.objectContaining({
              template: EmailTemplate.REMINDER_H3,
              context: expect.objectContaining({ daysRemaining: 3 }),
            }),
          ]),
        }),
        expect.any(Object),
      );
    });

    it('should queue H-1 reminder emails', async () => {
      const respondents = [{ email: 'user@test.com', fullName: 'User' }];
      const survey = { title: 'Survey', endDatetime: '2026-06-01', id: 'survey-1' };

      await service.sendReminder(respondents, survey, 1, 'https://app.test');

      expect(mockQueue.add).toHaveBeenCalledWith(
        BULK_EMAIL_JOB,
        expect.objectContaining({
          payloads: expect.arrayContaining([
            expect.objectContaining({
              template: EmailTemplate.REMINDER_H1,
              context: expect.objectContaining({ daysRemaining: 1 }),
            }),
          ]),
        }),
        expect.any(Object),
      );
    });
  });

  describe('sendSubmissionConfirmation', () => {
    it('should queue submission confirmation email', async () => {
      const respondent = { email: 'user@test.com', fullName: 'User' };
      const survey = { title: 'Survey' };
      const submittedAt = new Date('2026-05-07T10:00:00Z');

      await service.sendSubmissionConfirmation(respondent, survey, submittedAt, 5000);

      expect(mockQueue.add).toHaveBeenCalledWith(
        EMAIL_JOB,
        expect.objectContaining({
          payload: expect.objectContaining({
            to: 'user@test.com',
            template: EmailTemplate.SUBMISSION_CONFIRMATION,
            context: expect.objectContaining({
              respondentName: 'User',
              surveyTitle: 'Survey',
              pointsEarned: 5000,
            }),
          }),
        }),
        expect.objectContaining({
          attempts: EMAIL_RETRY_ATTEMPTS,
        }),
      );
    });

    it('should work without points earned', async () => {
      const respondent = { email: 'user@test.com', fullName: 'User' };
      const survey = { title: 'Survey' };
      const submittedAt = new Date();

      await service.sendSubmissionConfirmation(respondent, survey, submittedAt);

      expect(mockQueue.add).toHaveBeenCalledWith(
        EMAIL_JOB,
        expect.objectContaining({
          payload: expect.objectContaining({
            context: expect.objectContaining({
              pointsEarned: undefined,
            }),
          }),
        }),
        expect.any(Object),
      );
    });
  });

  describe('sendPointsThresholdNotification', () => {
    it('should queue points threshold notification', async () => {
      const respondent = { email: 'user@test.com', fullName: 'User' };

      await service.sendPointsThresholdNotification(respondent, 12000, 'https://app.test');

      expect(mockQueue.add).toHaveBeenCalledWith(
        EMAIL_JOB,
        expect.objectContaining({
          payload: expect.objectContaining({
            to: 'user@test.com',
            template: EmailTemplate.POINTS_THRESHOLD,
            context: expect.objectContaining({
              currentBalance: 12000,
              threshold: POINTS_THRESHOLD,
              redeemUrl: 'https://app.test/rewards/redeem',
            }),
          }),
        }),
        expect.any(Object),
      );
    });
  });

  describe('sendRedemptionConfirmation', () => {
    it('should queue redemption confirmation email', async () => {
      const respondent = { email: 'user@test.com', fullName: 'User' };
      const redemption = {
        rewardType: 'Pulsa',
        pointsSpent: 15000,
        destinationNumber: '08123456789',
        remainingBalance: 5000,
      };

      await service.sendRedemptionConfirmation(respondent, redemption);

      expect(mockQueue.add).toHaveBeenCalledWith(
        EMAIL_JOB,
        expect.objectContaining({
          payload: expect.objectContaining({
            to: 'user@test.com',
            template: EmailTemplate.REDEMPTION_CONFIRMATION,
            context: expect.objectContaining({
              rewardType: 'Pulsa',
              pointsSpent: 15000,
              destinationNumber: '08123456789',
              remainingBalance: 5000,
            }),
          }),
        }),
        expect.any(Object),
      );
    });
  });

  describe('sendOtpEmail', () => {
    it('should queue OTP email with high priority', async () => {
      await service.sendOtpEmail('user@test.com', 'User', '123456', 15);

      expect(mockQueue.add).toHaveBeenCalledWith(
        EMAIL_JOB,
        expect.objectContaining({
          payload: expect.objectContaining({
            to: 'user@test.com',
            template: EmailTemplate.OTP_VERIFICATION,
            context: expect.objectContaining({
              recipientName: 'User',
              otpCode: '123456',
              expiresInMinutes: 15,
            }),
          }),
        }),
        expect.objectContaining({
          priority: 1,
          attempts: EMAIL_RETRY_ATTEMPTS,
        }),
      );
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('should queue password reset email with high priority', async () => {
      await service.sendPasswordResetEmail('user@test.com', 'User', 'reset-token-123', 'https://app.test', 1);

      expect(mockQueue.add).toHaveBeenCalledWith(
        EMAIL_JOB,
        expect.objectContaining({
          payload: expect.objectContaining({
            to: 'user@test.com',
            template: EmailTemplate.PASSWORD_RESET,
            context: expect.objectContaining({
              recipientName: 'User',
              resetLink: 'https://app.test/auth/reset-password?token=reset-token-123',
              expiresInHours: 1,
            }),
          }),
        }),
        expect.objectContaining({
          priority: 1,
        }),
      );
    });
  });

  describe('getQueueStats', () => {
    it('should return queue statistics', async () => {
      const stats = await service.getQueueStats();

      expect(stats).toEqual({
        waiting: 5,
        active: 2,
        completed: 100,
        failed: 3,
        delayed: 1,
      });
    });
  });
});
