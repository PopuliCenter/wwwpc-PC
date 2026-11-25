import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  platform: 'android' as 'android' | 'web',
  getStatus: vi.fn(),
  openSettings: vi.fn(() => Promise.resolve()),
  pushCheck: vi.fn(),
  geoCheck: vi.fn(),
  geoRequest: vi.fn(() => Promise.resolve({ location: 'granted', coarseLocation: 'granted' })),
  initNativeNotifications: vi.fn(() => Promise.resolve()),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: () => mocks.platform,
    isNativePlatform: () => mocks.platform !== 'web',
  },
  registerPlugin: () => ({ getStatus: mocks.getStatus, openSettings: mocks.openSettings }),
}));
vi.mock('@capacitor/push-notifications', () => ({
  PushNotifications: { checkPermissions: mocks.pushCheck },
}));
vi.mock('@capacitor/geolocation', () => ({
  Geolocation: { checkPermissions: mocks.geoCheck, requestPermissions: mocks.geoRequest },
}));
vi.mock('@/services/notifications', () => ({
  initNativeNotifications: mocks.initNativeNotifications,
}));

import {
  PERMISSION_SNOOZE_MS,
  dismissPrompt,
  enableLocation,
  enableNotifications,
  isPromptDismissed,
  locationState,
  notificationsOff,
} from './devicePermissions';

beforeEach(() => {
  mocks.platform = 'android';
  vi.stubEnv('VITE_ENABLE_PUSH', 'true');
  vi.clearAllMocks();
  mocks.getStatus.mockResolvedValue({ notificationsEnabled: true, locationEnabled: true });
  mocks.pushCheck.mockResolvedValue({ receive: 'granted' });
  mocks.geoCheck.mockResolvedValue({ location: 'granted', coarseLocation: 'granted' });
  localStorage.clear();
});
afterEach(() => {
  vi.unstubAllEnvs();
});

describe('notificationsOff', () => {
  it('trusts the native status (covers notifications switched off in Settings)', async () => {
    mocks.getStatus.mockResolvedValueOnce({ notificationsEnabled: false, locationEnabled: true });
    await expect(notificationsOff()).resolves.toBe(true);
  });

  it('falls back to the push permission on an old APK without the plugin', async () => {
    mocks.getStatus.mockRejectedValueOnce(new Error('not implemented'));
    mocks.pushCheck.mockResolvedValueOnce({ receive: 'denied' });
    await expect(notificationsOff()).resolves.toBe(true);
  });

  it('stays quiet on the web and on builds without push', async () => {
    mocks.platform = 'web';
    await expect(notificationsOff()).resolves.toBe(false);
    mocks.platform = 'android';
    vi.stubEnv('VITE_ENABLE_PUSH', 'false');
    await expect(notificationsOff()).resolves.toBe(false);
  });
});

describe('enableNotifications', () => {
  it('asks for permission while Android still allows the dialog', async () => {
    mocks.pushCheck.mockResolvedValueOnce({ receive: 'prompt' });
    await enableNotifications();
    expect(mocks.initNativeNotifications).toHaveBeenCalled();
    expect(mocks.openSettings).not.toHaveBeenCalled();
  });

  it('opens notification settings when denied for good or switched off', async () => {
    mocks.pushCheck.mockResolvedValueOnce({ receive: 'denied' });
    await enableNotifications();
    mocks.pushCheck.mockResolvedValueOnce({ receive: 'granted' });
    await enableNotifications();
    expect(mocks.openSettings).toHaveBeenCalledTimes(2);
    expect(mocks.openSettings).toHaveBeenCalledWith({ target: 'notifications' });
    expect(mocks.initNativeNotifications).not.toHaveBeenCalled();
  });
});

describe('locationState / enableLocation', () => {
  it('reports GPS off before looking at the permission', async () => {
    mocks.getStatus.mockResolvedValueOnce({ notificationsEnabled: true, locationEnabled: false });
    await expect(locationState()).resolves.toBe('service-off');
    expect(mocks.geoCheck).not.toHaveBeenCalled();
  });

  it('reports a missing permission, and ok once granted', async () => {
    mocks.geoCheck.mockResolvedValueOnce({ location: 'prompt', coarseLocation: 'prompt' });
    await expect(locationState()).resolves.toBe('permission');
    await expect(locationState()).resolves.toBe('ok');
  });

  it('is ok on the web', async () => {
    mocks.platform = 'web';
    await expect(locationState()).resolves.toBe('ok');
  });

  it('opens location settings for GPS off, app settings for a permanent denial', async () => {
    await enableLocation('service-off');
    expect(mocks.openSettings).toHaveBeenLastCalledWith({ target: 'location' });

    mocks.geoCheck.mockResolvedValueOnce({ location: 'denied', coarseLocation: 'denied' });
    await enableLocation('permission');
    expect(mocks.openSettings).toHaveBeenLastCalledWith({ target: 'app' });
    expect(mocks.geoRequest).not.toHaveBeenCalled();
  });

  it('shows the permission dialog when it can still be asked', async () => {
    mocks.geoCheck.mockResolvedValueOnce({ location: 'prompt', coarseLocation: 'prompt' });
    await enableLocation('permission');
    expect(mocks.geoRequest).toHaveBeenCalledWith({ permissions: ['location'] });
    expect(mocks.openSettings).not.toHaveBeenCalled();
  });
});

describe('dismissPrompt', () => {
  it('hides a card until the snooze ends, per key', () => {
    const now = 5_000_000;
    dismissPrompt('notifications', PERMISSION_SNOOZE_MS, now);
    expect(isPromptDismissed('notifications', now + 1000)).toBe(true);
    expect(isPromptDismissed('location', now + 1000)).toBe(false);
    expect(isPromptDismissed('notifications', now + PERMISSION_SNOOZE_MS + 1)).toBe(false);
  });

  it('drops expired keys and survives a corrupt store', () => {
    dismissPrompt('update:3', 10, 0);
    dismissPrompt('update:4', 10, 100);
    expect(Object.keys(JSON.parse(localStorage.getItem('populi.prompts.dismissed')!))).toEqual([
      'update:4',
    ]);
    localStorage.setItem('populi.prompts.dismissed', '{rusak');
    expect(isPromptDismissed('update:4')).toBe(false);
  });
});
