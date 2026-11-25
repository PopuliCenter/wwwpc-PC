import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AppReleaseService, isAllowedDownloadUrl, parseAllowedHosts } from './app-release.service';
import { DEFAULT_DOWNLOAD_HOSTS } from './app-release.constants';

const HOSTS = ['populicenter.org', 'play.google.com'];

describe('isAllowedDownloadUrl', () => {
  it.each([
    'https://populicenter.org/unduh-aplikasi',
    'https://www.populicenter.org/unduh',
    'https://play.google.com/store/apps/details?id=com.populicenter.survei',
  ])('accepts %s', (url) => {
    expect(isAllowedDownloadUrl(url, HOSTS)).toBe(true);
  });

  it.each([
    'http://populicenter.org/unduh', // bukan https
    'https://populicenter.org.evil.id/app.apk', // domain lain berakhiran mirip
    'https://evilpopulicenter.org/app.apk', // bukan subdomain
    'https://user:pw@populicenter.org/', // kredensial di URL
    'javascript:alert(1)',
    'intent://scan/#Intent;scheme=zxing;end',
    'bukan url',
    '',
  ])('rejects %s', (url) => {
    expect(isAllowedDownloadUrl(url, HOSTS)).toBe(false);
  });
});

describe('parseAllowedHosts', () => {
  it('uses the defaults when env is empty', () => {
    expect(parseAllowedHosts(undefined)).toEqual(DEFAULT_DOWNLOAD_HOSTS);
    expect(parseAllowedHosts(' , ')).toEqual(DEFAULT_DOWNLOAD_HOSTS);
  });

  it('parses a comma list, trimmed and lower-cased', () => {
    expect(parseAllowedHosts(' Populicenter.ORG, play.google.com ')).toEqual([
      'populicenter.org',
      'play.google.com',
    ]);
  });
});

describe('AppReleaseService', () => {
  let rows: any[];
  let repo: any;
  let deviceTokens: any;
  let feed: any;
  let service: AppReleaseService;

  const byCodeDesc = (a: any, b: any) => b.versionCode - a.versionCode;

  beforeEach(() => {
    rows = [];
    repo = {
      findOne: vi.fn(async ({ where }: any) => {
        const match = rows
          .filter((r) => Object.entries(where).every(([k, v]) => r[k] === v))
          .sort(byCodeDesc);
        return match[0] ?? null;
      }),
      find: vi.fn(async () => [...rows].sort(byCodeDesc)),
      create: vi.fn((v: any) => ({ ...v })),
      save: vi.fn(async (v: any) => {
        const saved = {
          id: `r-${rows.length + 1}`,
          createdAt: new Date('2026-11-25T03:00:00Z'),
          ...v,
        };
        rows.push(saved);
        return saved;
      }),
      update: vi.fn(async () => undefined),
      delete: vi.fn(async ({ id }: any) => {
        rows = rows.filter((r) => r.id !== id);
      }),
    };
    deviceTokens = {
      activeUserIdsOnPlatform: vi.fn(async () => ['u-1', 'u-2']),
      pushToUsers: vi.fn(async () => 2),
    };
    feed = { createForUsers: vi.fn(async () => undefined) };
    service = new AppReleaseService(repo, deviceTokens, feed, {
      get: () => undefined,
    } as any);
  });

  const dto = (over: Record<string, unknown> = {}) =>
    ({
      versionCode: 2,
      versionName: '1.1.0',
      downloadUrl: 'https://populicenter.org/unduh-aplikasi',
      ...over,
    }) as any;

  describe('getVersionInfo', () => {
    it('returns an empty answer (min 0) when nothing has been released', async () => {
      await expect(service.getVersionInfo('android')).resolves.toMatchObject({
        latestVersionCode: null,
        latestVersionName: null,
        minSupportedVersionCode: 0,
        downloadUrl: null,
      });
    });

    it('takes the minimum from the newest FORCED release, the rest from the newest one', async () => {
      rows.push(
        {
          id: 'a',
          platform: 'android',
          versionCode: 2,
          versionName: '1.1.0',
          forceUpdate: true,
          downloadUrl: 'https://populicenter.org/a',
          createdAt: new Date(),
        },
        {
          id: 'b',
          platform: 'android',
          versionCode: 3,
          versionName: '1.2.0',
          forceUpdate: false,
          downloadUrl: 'https://populicenter.org/b',
          releaseNotes: 'Perbaikan',
          createdAt: new Date(),
        },
      );
      await expect(service.getVersionInfo('android')).resolves.toMatchObject({
        latestVersionCode: 3,
        latestVersionName: '1.2.0',
        minSupportedVersionCode: 2,
        downloadUrl: 'https://populicenter.org/b',
        releaseNotes: 'Perbaikan',
      });
    });

    it('caches the answer briefly and drops the cache when a release is created', async () => {
      await service.getVersionInfo('android');
      await service.getVersionInfo('android');
      expect(repo.findOne).toHaveBeenCalledTimes(2); // satu putaran (latest + forced)

      await service.create(dto(), 'admin-1');
      const info = await service.getVersionInfo('android');
      expect(info.latestVersionCode).toBe(2);
    });
  });

  describe('create', () => {
    it('rejects a download link outside the allowed domains', async () => {
      await expect(
        service.create(dto({ downloadUrl: 'https://contoh-apk.example/app.apk' }), 'admin-1'),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(repo.save).not.toHaveBeenCalled();
    });

    it('rejects a version code that is not higher than the latest release', async () => {
      await service.create(dto({ versionCode: 5 }), 'admin-1');
      await expect(service.create(dto({ versionCode: 5 }), 'admin-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
      await expect(service.create(dto({ versionCode: 4 }), 'admin-1')).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('saves trimmed values and does not announce unless asked', async () => {
      const { release, announced } = await service.create(
        dto({ versionName: ' 1.1.0 ', releaseNotes: '  ', forceUpdate: true }),
        'admin-1',
      );
      expect(release).toMatchObject({
        platform: 'android',
        versionName: '1.1.0',
        releaseNotes: null,
        forceUpdate: true,
        createdBy: 'admin-1',
      });
      expect(announced).toBeNull();
      expect(feed.createForUsers).not.toHaveBeenCalled();
    });

    it('announces to Android users (bell + Android-only push) when notify is set', async () => {
      const { announced } = await service.create(dto({ notify: true }), 'admin-1');
      expect(announced).toEqual({ recipients: 2, pushed: 2 });
      expect(deviceTokens.activeUserIdsOnPlatform).toHaveBeenCalledWith('android');
      expect(feed.createForUsers).toHaveBeenCalledWith(
        ['u-1', 'u-2'],
        expect.objectContaining({ type: 'app_update', link: '/app-update' }),
      );
      expect(deviceTokens.pushToUsers).toHaveBeenCalledWith(
        ['u-1', 'u-2'],
        expect.objectContaining({ data: { link: '/app-update' } }),
        'android',
      );
      expect(repo.update).toHaveBeenCalled();
    });
  });

  describe('announce', () => {
    it('only allows announcing the newest release', async () => {
      const old = (await service.create(dto({ versionCode: 2 }), 'admin-1')).release;
      await service.create(dto({ versionCode: 3, versionName: '1.2.0' }), 'admin-1');
      await expect(service.announce(old.id)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('returns 404 for an unknown release', async () => {
      await expect(service.announce('nope')).rejects.toBeInstanceOf(NotFoundException);
    });

    it('writes nothing to the bell when no Android user is registered', async () => {
      deviceTokens.activeUserIdsOnPlatform.mockResolvedValueOnce([]);
      const { release } = await service.create(dto(), 'admin-1');
      await expect(service.announce(release.id)).resolves.toEqual({ recipients: 0, pushed: 0 });
      expect(feed.createForUsers).not.toHaveBeenCalled();
      expect(deviceTokens.pushToUsers).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deletes a release and 404s when it does not exist', async () => {
      const { release } = await service.create(dto(), 'admin-1');
      await expect(service.remove(release.id)).resolves.toMatchObject({ versionCode: 2 });
      expect(rows).toHaveLength(0);
      await expect(service.remove(release.id)).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
