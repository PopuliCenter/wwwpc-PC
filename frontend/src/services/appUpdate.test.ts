import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  platform: 'android' as 'android' | 'ios' | 'web',
  build: '3',
  get: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => mocks.platform !== 'web',
    getPlatform: () => mocks.platform,
  },
}));
vi.mock('@capacitor/app', () => ({
  App: { getInfo: () => Promise.resolve({ version: '1.2.0', build: mocks.build }) },
}));
vi.mock('@/services/api', () => ({ api: { get: mocks.get } }));

import {
  type AppVersionInfo,
  SNOOZE_MS,
  evaluateUpdate,
  fetchAppVersion,
  getNativeVersionCode,
  isSafeDownloadUrl,
  isSnoozed,
  loadCachedInfo,
  nativeUpdatePlatform,
  openDownloadUrl,
  snoozeUpdate,
} from './appUpdate';

const info = (over: Partial<AppVersionInfo> = {}): AppVersionInfo => ({
  platform: 'android',
  latestVersionCode: 5,
  latestVersionName: '1.4.0',
  minSupportedVersionCode: 3,
  downloadUrl: 'https://populicenter.org/unduh-aplikasi',
  releaseNotes: null,
  publishedAt: null,
  ...over,
});

describe('evaluateUpdate', () => {
  it('requires an update below the minimum version', () => {
    expect(evaluateUpdate(2, info())).toBe('required');
  });

  it('offers an optional update between the minimum and the latest', () => {
    expect(evaluateUpdate(3, info())).toBe('optional');
    expect(evaluateUpdate(4, info())).toBe('optional');
  });

  it('does nothing on the latest (or a newer test) build', () => {
    expect(evaluateUpdate(5, info())).toBe('none');
    expect(evaluateUpdate(9, info())).toBe('none');
  });

  it('does nothing without a release, a version code, or a minimum of 0', () => {
    expect(evaluateUpdate(1, info({ latestVersionCode: null, minSupportedVersionCode: 0 }))).toBe(
      'none',
    );
    expect(evaluateUpdate(null, info())).toBe('none');
    expect(evaluateUpdate(1, null)).toBe('none');
    expect(evaluateUpdate(1, info({ latestVersionCode: 1, minSupportedVersionCode: 0 }))).toBe(
      'none',
    );
  });
});

describe('isSafeDownloadUrl', () => {
  it('accepts https links only, without credentials', () => {
    expect(isSafeDownloadUrl('https://populicenter.org/unduh')).toBe(true);
    expect(isSafeDownloadUrl('https://play.google.com/store/apps/details?id=x')).toBe(true);
    expect(isSafeDownloadUrl('http://populicenter.org/unduh')).toBe(false);
    expect(isSafeDownloadUrl('javascript:alert(1)')).toBe(false);
    expect(isSafeDownloadUrl('https://a:b@populicenter.org/')).toBe(false);
    expect(isSafeDownloadUrl(null)).toBe(false);
    expect(isSafeDownloadUrl('')).toBe(false);
  });
});

describe('native version + platform', () => {
  afterEach(() => {
    mocks.platform = 'android';
    mocks.build = '3';
  });

  it('reads versionCode from App.getInfo().build', async () => {
    await expect(getNativeVersionCode()).resolves.toBe(3);
    mocks.build = 'abc';
    await expect(getNativeVersionCode()).resolves.toBeNull();
  });

  it('is inactive on the web', async () => {
    mocks.platform = 'web';
    await expect(getNativeVersionCode()).resolves.toBeNull();
    expect(nativeUpdatePlatform()).toBeNull();
  });

  it('only Android has releases (iOS is not supported yet)', () => {
    expect(nativeUpdatePlatform()).toBe('android');
    mocks.platform = 'ios';
    expect(nativeUpdatePlatform()).toBeNull();
  });
});

describe('cache + snooze', () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.get.mockReset();
  });

  it('caches the last fetched info for offline starts', async () => {
    mocks.get.mockResolvedValueOnce(info());
    await fetchAppVersion('android');
    expect(mocks.get).toHaveBeenCalledWith('/app/version?platform=android');
    expect(loadCachedInfo()).toMatchObject({ minSupportedVersionCode: 3 });
  });

  it('ignores a corrupt cache', () => {
    localStorage.setItem('populi.appUpdate.lastInfo', '{bukan json');
    expect(loadCachedInfo()).toBeNull();
  });

  it('snoozes only the same version, for 24 hours', () => {
    const now = 1_000_000;
    snoozeUpdate(5, now);
    expect(isSnoozed(5, now + 1000)).toBe(true);
    expect(isSnoozed(6, now + 1000)).toBe(false); // versi lebih baru → tawarkan lagi
    expect(isSnoozed(5, now + SNOOZE_MS + 1)).toBe(false);
    expect(isSnoozed(null, now)).toBe(false);
  });
});

describe('openDownloadUrl', () => {
  const spyOpen = () => vi.spyOn(window, 'open').mockImplementation(() => null);
  let open: ReturnType<typeof spyOpen>;
  beforeEach(() => {
    open = spyOpen();
  });
  afterEach(() => {
    open.mockRestore();
    mocks.platform = 'android';
  });

  it('opens https links outside the app and refuses anything else', () => {
    expect(openDownloadUrl('https://populicenter.org/unduh')).toBe(true);
    expect(open).toHaveBeenCalledWith('https://populicenter.org/unduh', '_blank');
    expect(openDownloadUrl('javascript:alert(1)')).toBe(false);
    expect(open).toHaveBeenCalledTimes(1);
  });

  it('uses noopener on the web', () => {
    mocks.platform = 'web';
    openDownloadUrl('https://populicenter.org/unduh');
    expect(open).toHaveBeenCalledWith(
      'https://populicenter.org/unduh',
      '_blank',
      'noopener,noreferrer',
    );
  });
});
