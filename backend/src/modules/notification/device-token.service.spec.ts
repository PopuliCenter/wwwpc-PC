import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import {
  DeviceTokenService,
  MAX_TOKENS_PER_USER,
  TEST_PUSH_PAYLOAD,
  TOKEN_QUERY_CHUNK,
} from './device-token.service';
import { DeviceToken } from './entities/device-token.entity';
import { PushService } from './push.service';
import { User } from '@modules/auth/entities/user.entity';

describe('DeviceTokenService', () => {
  let service: DeviceTokenService;
  let repo: any;
  let userRepo: any;
  let pushService: any;

  beforeEach(async () => {
    repo = {
      upsert: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      find: vi.fn().mockResolvedValue([]),
    };
    userRepo = {
      findOne: vi.fn().mockResolvedValue({ id: 'user-1' }),
    };
    pushService = {
      isEnabled: vi.fn().mockReturnValue(true),
      sendToTokens: vi.fn().mockResolvedValue({ sent: 0, failedTokens: [] }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeviceTokenService,
        { provide: getRepositoryToken(DeviceToken), useValue: repo },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: PushService, useValue: pushService },
      ],
    }).compile();

    service = module.get<DeviceTokenService>(DeviceTokenService);
  });

  it('upserts a device token by unique token', async () => {
    await service.register('user-1', 'tok-1', 'android');
    expect(repo.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'user-1', token: 'tok-1', platform: 'android' }),
      expect.objectContaining({ conflictPaths: ['token'] }),
    );
  });

  it('prunes tokens beyond MAX_TOKENS_PER_USER newest after register', async () => {
    repo.find.mockResolvedValue([{ id: 'old-1' }, { id: 'old-2' }]);
    await service.register('user-1', 'tok-11', 'android');
    expect(repo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: 'user-1' },
        order: { lastSeenAt: 'DESC', createdAt: 'DESC' },
        skip: MAX_TOKENS_PER_USER,
      }),
    );
    expect(repo.delete).toHaveBeenCalledTimes(1);
    const arg = repo.delete.mock.calls[0][0];
    expect(arg.id.value ?? arg.id._value).toEqual(['old-1', 'old-2']);
  });

  it('does not delete anything when the user is under the cap', async () => {
    repo.find.mockResolvedValue([]);
    await service.register('user-1', 'tok-1', 'android');
    expect(repo.delete).not.toHaveBeenCalled();
  });

  it('register still succeeds when pruning fails', async () => {
    repo.find.mockRejectedValue(new Error('db down'));
    await expect(service.register('user-1', 'tok-1', 'android')).resolves.toBeUndefined();
  });

  it('removeForUser deletes only the row matching BOTH user and token', async () => {
    await service.removeForUser('user-1', 'tok-1');
    expect(repo.delete).toHaveBeenCalledWith({ userId: 'user-1', token: 'tok-1' });
  });

  it('returns 0 and skips push when users have no tokens', async () => {
    repo.find.mockResolvedValue([]);
    const sent = await service.pushToUsers(['user-1'], { title: 't', body: 'b' });
    expect(sent).toBe(0);
    expect(pushService.sendToTokens).not.toHaveBeenCalled();
  });

  it('pushes to collected tokens and cleans up failed ones', async () => {
    repo.find.mockResolvedValue([{ token: 'tok-1' }, { token: 'tok-2' }]);
    pushService.sendToTokens.mockResolvedValue({ sent: 1, failedTokens: ['tok-2'] });

    const sent = await service.pushToUsers(['user-1'], {
      title: 'Survei baru',
      body: 'Isi sekarang',
      data: { link: '/surveys/x/fill' },
    });

    expect(sent).toBe(1);
    expect(pushService.sendToTokens).toHaveBeenCalledWith(
      ['tok-1', 'tok-2'],
      expect.objectContaining({ title: 'Survei baru' }),
    );
    // Token gagal/kedaluwarsa dibersihkan.
    expect(repo.delete).toHaveBeenCalledWith({ token: expect.anything() });
  });

  describe('getTokensForUsers', () => {
    it('does not query when there are no users', async () => {
      expect(await service.getTokensForUsers([])).toEqual([]);
      expect(repo.find).not.toHaveBeenCalled();
    });

    it('splits large id lists into chunks below the Postgres bind-parameter limit', async () => {
      const ids = Array.from({ length: TOKEN_QUERY_CHUNK * 2 + 5 }, (_, i) => `user-${i}`);
      repo.find
        .mockResolvedValueOnce([{ token: 'tok-a' }])
        .mockResolvedValueOnce([{ token: 'tok-b' }, { token: 'tok-c' }])
        .mockResolvedValueOnce([{ token: 'tok-d' }]);

      const tokens = await service.getTokensForUsers(ids);

      expect(tokens).toEqual(['tok-a', 'tok-b', 'tok-c', 'tok-d']);
      expect(repo.find).toHaveBeenCalledTimes(3);
      const calls = repo.find.mock.calls as [{ where: { userId: { value: string[] } } }][];
      const chunkSizes = calls.map(([opts]) => opts.where.userId.value.length);
      expect(chunkSizes).toEqual([TOKEN_QUERY_CHUNK, TOKEN_QUERY_CHUNK, 5]);
      // Setiap id ditanyakan tepat sekali.
      expect(calls.flatMap(([opts]) => opts.where.userId.value)).toEqual(ids);
      expect(TOKEN_QUERY_CHUNK).toBeLessThan(65_535);
    });
  });

  describe('sendTestPush', () => {
    it('pushes the test message to every device of the user and reports the counts', async () => {
      repo.find.mockResolvedValue([{ token: 'tok-1' }, { token: 'tok-2' }, { token: 'tok-3' }]);
      pushService.sendToTokens.mockResolvedValue({ sent: 2, failedTokens: ['tok-3'] });

      const result = await service.sendTestPush('user-1');

      expect(result).toEqual({ pushEnabled: true, devices: 3, pushed: 2 });
      expect(userRepo.findOne).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'user-1' } }),
      );
      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: expect.anything() } }),
      );
      expect(pushService.sendToTokens).toHaveBeenCalledTimes(1);
      expect(pushService.sendToTokens).toHaveBeenCalledWith(
        ['tok-1', 'tok-2', 'tok-3'],
        TEST_PUSH_PAYLOAD,
      );
      // Token yang ditolak FCM ikut dibersihkan.
      expect(repo.delete).toHaveBeenCalledTimes(1);
    });

    it('uses the agreed title, body and link', () => {
      expect(TEST_PUSH_PAYLOAD).toEqual({
        title: 'Notifikasi uji',
        body: 'Jika pesan ini muncul, notifikasi di HP Anda sudah berfungsi.',
        data: { link: '/notifications' },
      });
    });

    it('throws NotFoundException (404) for an unknown user and pushes nothing', async () => {
      userRepo.findOne.mockResolvedValue(null);

      await expect(service.sendTestPush('missing-user')).rejects.toBeInstanceOf(NotFoundException);
      expect(repo.find).not.toHaveBeenCalled();
      expect(pushService.sendToTokens).not.toHaveBeenCalled();
    });

    it('reports pushEnabled=false (and still counts devices) when push is off on the server', async () => {
      pushService.isEnabled.mockReturnValue(false);
      repo.find.mockResolvedValue([{ token: 'tok-1' }, { token: 'tok-2' }]);

      const result = await service.sendTestPush('user-1');

      expect(result).toEqual({ pushEnabled: false, devices: 2, pushed: 0 });
      expect(pushService.sendToTokens).not.toHaveBeenCalled();
    });

    it('reports 0 devices without calling FCM when the user has no registered device', async () => {
      repo.find.mockResolvedValue([]);

      const result = await service.sendTestPush('user-1');

      expect(result).toEqual({ pushEnabled: true, devices: 0, pushed: 0 });
      expect(pushService.sendToTokens).not.toHaveBeenCalled();
    });
  });
});
