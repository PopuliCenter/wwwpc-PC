import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ResponseSubmittedHandler } from './response-submitted.handler';
import { ResponseSubmittedPayload } from '../event-types';

describe('ResponseSubmittedHandler', () => {
  let handler: ResponseSubmittedHandler;
  let mockNotificationService: any;
  let mockRewardService: any;
  let mockAuditService: any;

  const payload: ResponseSubmittedPayload = {
    surveyId: 'survey-1',
    respondentId: 'user-1',
    responseId: 'response-1',
    respondentEmail: 'user@example.com',
    respondentName: 'Test User',
    surveyTitle: 'Test Survey',
    submittedAt: new Date('2024-01-01T10:00:00Z'),
    rewardPoints: 250,
  };

  beforeEach(() => {
    mockNotificationService = {
      sendSubmissionConfirmation: vi.fn().mockResolvedValue(undefined),
    };
    mockRewardService = {
      creditSurveyCompletion: vi.fn().mockResolvedValue({ id: 'tx-1', amount: 100 }),
    };
    mockAuditService = {
      log: vi.fn().mockResolvedValue(undefined),
    };

    handler = new ResponseSubmittedHandler(
      mockNotificationService,
      mockRewardService,
      mockAuditService,
    );
  });

  describe('handleRewardCredit', () => {
    it('should credit the survey-configured points to the respondent', async () => {
      await handler.handleRewardCredit(payload);

      expect(mockRewardService.creditSurveyCompletion).toHaveBeenCalledWith(
        'user-1',
        'survey-1',
        250, // payload.rewardPoints (the configured reward)
        'complete',
      );
    });

    it('should fall back to the default base points when rewardPoints is null', async () => {
      await handler.handleRewardCredit({ ...payload, rewardPoints: null });

      expect(mockRewardService.creditSurveyCompletion).toHaveBeenCalledWith(
        'user-1',
        'survey-1',
        100, // DEFAULT_SURVEY_COMPLETION_POINTS
        'complete',
      );
    });

    it('should not throw when reward service fails', async () => {
      mockRewardService.creditSurveyCompletion.mockRejectedValue(new Error('DB error'));

      await expect(handler.handleRewardCredit(payload)).resolves.not.toThrow();
    });
  });

  describe('handleNotification', () => {
    it('should send submission confirmation email', async () => {
      await handler.handleNotification(payload);

      expect(mockNotificationService.sendSubmissionConfirmation).toHaveBeenCalledWith(
        { email: 'user@example.com', fullName: 'Test User' },
        { title: 'Test Survey' },
        payload.submittedAt,
        250, // pointsEarned = payload.rewardPoints
      );
    });

    it('should not throw when notification service fails', async () => {
      mockNotificationService.sendSubmissionConfirmation.mockRejectedValue(
        new Error('Queue error'),
      );

      await expect(handler.handleNotification(payload)).resolves.not.toThrow();
    });
  });

  describe('handleAuditLog', () => {
    it('should log audit event for submission', async () => {
      await handler.handleAuditLog(payload);

      expect(mockAuditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          module: 'response',
          details: expect.objectContaining({
            surveyId: 'survey-1',
            responseId: 'response-1',
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
