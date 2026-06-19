import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { NotificationSchedulerService } from './notification-scheduler.service';
import { NotificationService } from '../notification.service';
import { DeviceTokenService } from '../device-token.service';
import { Survey } from '@modules/survey/entities/survey.entity';
import { SurveyResponse } from '@modules/response/entities/survey-response.entity';
import { User } from '@modules/auth/entities/user.entity';
import { SurveyStatus } from '@shared/enums';

describe('NotificationSchedulerService', () => {
  let service: NotificationSchedulerService;
  let notificationService: any;
  let surveyRepository: any;
  let responseRepository: any;
  let userRepository: any;
  let deviceTokenService: any;

  const mockQueryBuilder = {
    select: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    andWhere: vi.fn().mockReturnThis(),
    getMany: vi.fn().mockResolvedValue([]),
  };

  beforeEach(async () => {
    notificationService = {
      sendReminder: vi.fn().mockResolvedValue(undefined),
      sendSurveyInvitation: vi.fn().mockResolvedValue(undefined),
    };

    surveyRepository = {
      find: vi.fn().mockResolvedValue([]),
      findOne: vi.fn().mockResolvedValue(null),
    };

    responseRepository = {
      find: vi.fn().mockResolvedValue([]),
    };

    userRepository = {
      createQueryBuilder: vi.fn().mockReturnValue(mockQueryBuilder),
    };

    deviceTokenService = {
      pushToUsers: vi.fn().mockResolvedValue(0),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationSchedulerService,
        { provide: NotificationService, useValue: notificationService },
        { provide: ConfigService, useValue: { get: vi.fn().mockReturnValue('http://localhost:3000') } },
        { provide: getRepositoryToken(Survey), useValue: surveyRepository },
        { provide: getRepositoryToken(SurveyResponse), useValue: responseRepository },
        { provide: getRepositoryToken(User), useValue: userRepository },
        { provide: DeviceTokenService, useValue: deviceTokenService },
      ],
    }).compile();

    service = module.get<NotificationSchedulerService>(NotificationSchedulerService);
  });

  describe('sendH3Reminders', () => {
    it('should find active surveys with deadline in 3 days and send reminders', async () => {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + 3);

      const mockSurvey = {
        id: 'survey-1',
        title: 'Test Survey',
        status: SurveyStatus.ACTIVE,
        endDatetime: targetDate,
      };

      surveyRepository.find.mockResolvedValue([mockSurvey]);
      responseRepository.find.mockResolvedValue([]);
      mockQueryBuilder.getMany.mockResolvedValue([
        { email: 'user@test.com', fullName: 'Test User' },
      ]);

      await service.sendH3Reminders();

      expect(surveyRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: SurveyStatus.ACTIVE,
          }),
        }),
      );
      expect(notificationService.sendReminder).toHaveBeenCalledWith(
        [{ email: 'user@test.com', fullName: 'Test User' }],
        expect.objectContaining({ title: 'Test Survey', id: 'survey-1' }),
        3,
        'http://localhost:3000',
      );
    });

    it('should not send reminders if no pending respondents', async () => {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + 3);

      surveyRepository.find.mockResolvedValue([{
        id: 'survey-1',
        title: 'Test Survey',
        endDatetime: targetDate,
      }]);
      responseRepository.find.mockResolvedValue([]);
      mockQueryBuilder.getMany.mockResolvedValue([]);

      await service.sendH3Reminders();

      expect(notificationService.sendReminder).not.toHaveBeenCalled();
    });

    it('should not send reminders if no surveys have deadline in 3 days', async () => {
      surveyRepository.find.mockResolvedValue([]);

      await service.sendH3Reminders();

      expect(notificationService.sendReminder).not.toHaveBeenCalled();
    });
  });

  describe('sendH1Reminders', () => {
    it('should find active surveys with deadline in 1 day and send reminders', async () => {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + 1);

      const mockSurvey = {
        id: 'survey-2',
        title: 'Urgent Survey',
        status: SurveyStatus.ACTIVE,
        endDatetime: targetDate,
      };

      surveyRepository.find.mockResolvedValue([mockSurvey]);
      responseRepository.find.mockResolvedValue([]);
      mockQueryBuilder.getMany.mockResolvedValue([
        { email: 'user1@test.com', fullName: 'User One' },
        { email: 'user2@test.com', fullName: 'User Two' },
      ]);

      await service.sendH1Reminders();

      expect(notificationService.sendReminder).toHaveBeenCalledWith(
        expect.arrayContaining([
          { email: 'user1@test.com', fullName: 'User One' },
          { email: 'user2@test.com', fullName: 'User Two' },
        ]),
        expect.objectContaining({ title: 'Urgent Survey', id: 'survey-2' }),
        1,
        'http://localhost:3000',
      );
    });

    it('should exclude respondents who already have a response', async () => {
      const targetDate = new Date();
      targetDate.setDate(targetDate.getDate() + 1);

      surveyRepository.find.mockResolvedValue([{
        id: 'survey-1',
        title: 'Survey',
        endDatetime: targetDate,
      }]);
      responseRepository.find.mockResolvedValue([
        { respondentId: 'user-already-responded' },
      ]);
      mockQueryBuilder.getMany.mockResolvedValue([
        { email: 'new-user@test.com', fullName: 'New User' },
      ]);

      await service.sendH1Reminders();

      // Verify the query builder was called with NOT IN clause for responded users
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'user.id NOT IN (:...respondedIds)',
        { respondedIds: ['user-already-responded'] },
      );
    });

    it('should handle errors gracefully without crashing', async () => {
      surveyRepository.find.mockRejectedValue(new Error('DB connection failed'));

      // Should not throw
      await expect(service.sendH1Reminders()).resolves.not.toThrow();
    });
  });

  describe('sendInvitationsForSurvey', () => {
    it('queues invitations for an active survey to respondents who have not filled it', async () => {
      surveyRepository.findOne.mockResolvedValue({
        id: 'survey-1',
        title: 'Survei Baru',
        description: 'desc',
        status: SurveyStatus.ACTIVE,
        endDatetime: new Date('2026-07-01T00:00:00.000Z'),
      });
      responseRepository.find.mockResolvedValue([]); // belum ada yang mengisi
      mockQueryBuilder.getMany.mockResolvedValue([
        { id: 'u-a', email: 'a@x.com', fullName: 'A' },
        { id: 'u-b', email: 'b@x.com', fullName: 'B' },
      ]);
      deviceTokenService.pushToUsers.mockResolvedValue(2);

      const result = await service.sendInvitationsForSurvey('survey-1');

      expect(result).toEqual({ recipients: 2, pushed: 2 });
      expect(notificationService.sendSurveyInvitation).toHaveBeenCalledWith(
        [
          { id: 'u-a', email: 'a@x.com', fullName: 'A' },
          { id: 'u-b', email: 'b@x.com', fullName: 'B' },
        ],
        expect.objectContaining({ id: 'survey-1', title: 'Survei Baru' }),
        expect.any(String),
      );
      // Push dikirim ke id responden dengan link ke pengisian survei.
      expect(deviceTokenService.pushToUsers).toHaveBeenCalledWith(
        ['u-a', 'u-b'],
        expect.objectContaining({ data: { link: '/surveys/survey-1/fill' } }),
      );
    });

    it('rejects when the survey is not active', async () => {
      surveyRepository.findOne.mockResolvedValue({
        id: 'survey-1',
        title: 'Survei',
        status: SurveyStatus.INACTIVE,
      });

      await expect(service.sendInvitationsForSurvey('survey-1')).rejects.toThrow();
      expect(notificationService.sendSurveyInvitation).not.toHaveBeenCalled();
    });

    it('returns 0 recipients (no email) when everyone has already filled', async () => {
      surveyRepository.findOne.mockResolvedValue({
        id: 'survey-1',
        title: 'Survei',
        status: SurveyStatus.ACTIVE,
        endDatetime: new Date(),
      });
      mockQueryBuilder.getMany.mockResolvedValue([]);

      const result = await service.sendInvitationsForSurvey('survey-1');

      expect(result).toEqual({ recipients: 0, pushed: 0 });
      expect(notificationService.sendSurveyInvitation).not.toHaveBeenCalled();
    });

    it('throws when the survey does not exist', async () => {
      surveyRepository.findOne.mockResolvedValue(null);

      await expect(service.sendInvitationsForSurvey('missing')).rejects.toThrow();
    });
  });
});
