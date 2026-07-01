import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotificationFeedService } from './notification-feed.service';
import { UserNotification } from './entities/user-notification.entity';
import { User } from '@modules/auth/entities/user.entity';
import { DeviceTokenService } from './device-token.service';
import { NotificationService } from './notification.service';
import { ConfigService } from '@nestjs/config';

describe('NotificationFeedService', () => {
  let service: NotificationFeedService;
  let feedRepo: any;
  let userRepo: any;
  let deviceTokenService: any;
  let notificationService: any;

  beforeEach(async () => {
    feedRepo = {
      create: vi.fn().mockImplementation((d: any) => d),
      save: vi.fn().mockResolvedValue(undefined),
      find: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(0),
      update: vi.fn().mockResolvedValue({ affected: 1 }),
    };
    userRepo = { find: vi.fn().mockResolvedValue([]) };
    deviceTokenService = { pushToUsers: vi.fn().mockResolvedValue(0) };
    notificationService = { sendAnnouncementEmail: vi.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationFeedService,
        { provide: getRepositoryToken(UserNotification), useValue: feedRepo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: DeviceTokenService, useValue: deviceTokenService },
        { provide: NotificationService, useValue: notificationService },
        {
          provide: ConfigService,
          useValue: { get: vi.fn().mockReturnValue('https://survei.example.com') },
        },
      ],
    }).compile();

    service = module.get<NotificationFeedService>(NotificationFeedService);
  });

  it('createForUsers does nothing for an empty list', async () => {
    await service.createForUsers([], { type: 'announcement', title: 't', body: 'b' });
    expect(feedRepo.save).not.toHaveBeenCalled();
  });

  it('createForUsers batch-saves one row per user', async () => {
    await service.createForUsers(['u1', 'u2'], {
      type: 'survey_new',
      title: 'Survei baru',
      body: 'isi',
      link: '/surveys/x/fill',
    });
    expect(feedRepo.save).toHaveBeenCalledTimes(1);
    const rows = feedRepo.save.mock.calls[0][0];
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ userId: 'u1', type: 'survey_new', link: '/surveys/x/fill' });
  });

  it('broadcastAnnouncement fans out to active respondents + pushes when requested', async () => {
    userRepo.find.mockResolvedValue([{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }]);
    deviceTokenService.pushToUsers.mockResolvedValue(2);

    const result = await service.broadcastAnnouncement({
      title: 'Info',
      body: 'Pesan',
      link: '/rewards',
      sendPush: true,
    });

    expect(result).toEqual({ recipients: 3, pushed: 2, emailed: 0 });
    expect(feedRepo.save).toHaveBeenCalled();
    expect(deviceTokenService.pushToUsers).toHaveBeenCalledWith(
      ['r1', 'r2', 'r3'],
      expect.objectContaining({ title: 'Info', data: { link: '/rewards' } }),
    );
    expect(notificationService.sendAnnouncementEmail).not.toHaveBeenCalled();
  });

  it('broadcastAnnouncement emails recipients with an absolute action URL when sendEmail', async () => {
    userRepo.find.mockResolvedValue([
      { id: 'r1', email: 'a@x.com', fullName: 'A' },
      { id: 'r2', email: 'b@x.com', fullName: 'B' },
    ]);

    const result = await service.broadcastAnnouncement({
      title: 'Promo',
      body: 'Isi',
      link: '/rewards',
      sendEmail: true,
    });

    expect(result).toEqual({ recipients: 2, pushed: 0, emailed: 2 });
    expect(notificationService.sendAnnouncementEmail).toHaveBeenCalledWith(
      [
        { email: 'a@x.com', fullName: 'A' },
        { email: 'b@x.com', fullName: 'B' },
      ],
      expect.objectContaining({ title: 'Promo', actionUrl: 'https://survei.example.com/rewards' }),
    );
  });

  it('broadcastAnnouncement does not push/email when both flags are false', async () => {
    userRepo.find.mockResolvedValue([{ id: 'r1' }]);

    const result = await service.broadcastAnnouncement({ title: 'x', body: 'y' });

    expect(result).toEqual({ recipients: 1, pushed: 0, emailed: 0 });
    expect(deviceTokenService.pushToUsers).not.toHaveBeenCalled();
    expect(notificationService.sendAnnouncementEmail).not.toHaveBeenCalled();
  });

  it('markRead targets all unread when no ids given', async () => {
    await service.markRead('u1');
    expect(feedRepo.update).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'u1' }),
      expect.objectContaining({ readAt: expect.any(Date) }),
    );
  });
});
