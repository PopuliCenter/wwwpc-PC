import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SurveyActivatedHandler } from './survey-activated.handler';
import { SurveyActivatedPayload } from '../event-types';

describe('SurveyActivatedHandler', () => {
  let handler: SurveyActivatedHandler;
  let mockNotificationService: any;

  const payload: SurveyActivatedPayload = {
    surveyId: 'survey-1',
    surveyTitle: 'Test Survey',
    surveyDescription: 'A test survey',
    endDatetime: '2024-12-31T23:59:59Z',
    respondents: [
      { email: 'user1@example.com', fullName: 'User One' },
      { email: 'user2@example.com', fullName: 'User Two' },
    ],
    baseUrl: 'https://survey.example.com',
  };

  beforeEach(() => {
    mockNotificationService = {
      sendSurveyInvitation: vi.fn().mockResolvedValue(undefined),
    };

    handler = new SurveyActivatedHandler(mockNotificationService);
  });

  describe('handleSendInvitations', () => {
    it('should send invitation emails to all respondents', async () => {
      await handler.handleSendInvitations(payload);

      expect(mockNotificationService.sendSurveyInvitation).toHaveBeenCalledWith(
        payload.respondents,
        {
          title: 'Test Survey',
          description: 'A test survey',
          endDatetime: '2024-12-31T23:59:59Z',
          id: 'survey-1',
        },
        'https://survey.example.com',
      );
    });

    it('should not send invitations when respondents list is empty', async () => {
      const emptyPayload = { ...payload, respondents: [] };

      await handler.handleSendInvitations(emptyPayload);

      expect(mockNotificationService.sendSurveyInvitation).not.toHaveBeenCalled();
    });

    it('should not throw when notification service fails', async () => {
      mockNotificationService.sendSurveyInvitation.mockRejectedValue(new Error('Queue error'));

      await expect(handler.handleSendInvitations(payload)).resolves.not.toThrow();
    });
  });
});
