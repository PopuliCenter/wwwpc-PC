import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DeviceTokenService } from './device-token.service';
import { DeviceToken } from './entities/device-token.entity';
import { PushService } from './push.service';

describe('DeviceTokenService', () => {
  let service: DeviceTokenService;
  let repo: any;
  let pushService: any;

  beforeEach(async () => {
    repo = {
      upsert: vi.fn().mockResolvedValue(undefined),
      delete: vi.fn().mockResolvedValue(undefined),
      find: vi.fn().mockResolvedValue([]),
    };
    pushService = {
      sendToTokens: vi.fn().mockResolvedValue({ sent: 0, failedTokens: [] }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeviceTokenService,
        { provide: getRepositoryToken(DeviceToken), useValue: repo },
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
});
