import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type Handler = (payload: unknown) => void;

const mocks = vi.hoisted(() => ({
  handlers: {} as Record<string, (payload: unknown) => void>,
  showAppNotice: vi.fn(),
  requestFeedRefresh: vi.fn(),
  navigate: vi.fn(),
  post: vi.fn(() => Promise.resolve()),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, getPlatform: () => 'android' },
}));
vi.mock('@capacitor/push-notifications', () => ({
  PushNotifications: {
    requestPermissions: vi.fn(() => Promise.resolve({ receive: 'granted' })),
    createChannel: vi.fn(() => Promise.resolve()),
    register: vi.fn(() => Promise.resolve()),
    addListener: vi.fn((event: string, cb: Handler) => {
      mocks.handlers[event] = cb;
      return Promise.resolve({ remove: vi.fn() });
    }),
  },
}));
vi.mock('@/router', () => ({ router: { navigate: mocks.navigate } }));
vi.mock('@/services/api', () => ({ api: { post: mocks.post } }));
vi.mock('@/stores/notification.store', () => ({ showAppNotice: mocks.showAppNotice }));
vi.mock('@/services/notificationFeed', () => ({
  requestFeedRefresh: mocks.requestFeedRefresh,
}));

describe('initNativeNotifications', () => {
  beforeEach(async () => {
    vi.stubEnv('VITE_ENABLE_PUSH', 'true');
    const { initNativeNotifications } = await import('./notifications');
    await initNativeNotifications();
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('push di depan: tampilkan pop-up in-app DAN segarkan lonceng/feed', () => {
    mocks.handlers.pushNotificationReceived({
      title: 'Pengingat survei',
      body: 'Survei ditutup besok',
      data: { link: '/surveys/abc/fill' },
    });
    expect(mocks.showAppNotice).toHaveBeenCalledWith({
      title: 'Pengingat survei',
      body: 'Survei ditutup besok',
      link: '/surveys/abc/fill',
      tone: 'info',
    });
    expect(mocks.requestFeedRefresh).toHaveBeenCalledTimes(1);
  });

  it('notifikasi diketuk membuka link internal saja', () => {
    mocks.handlers.pushNotificationActionPerformed({
      notification: { data: { link: '/notifications' } },
    });
    expect(mocks.navigate).toHaveBeenCalledWith('/notifications');

    mocks.navigate.mockClear();
    mocks.handlers.pushNotificationActionPerformed({
      notification: { data: { link: 'https://contoh.com' } },
    });
    expect(mocks.navigate).not.toHaveBeenCalled();
  });

  it('token registrasi dikirim ke backend', () => {
    mocks.handlers.registration({ value: 'tok-1' });
    expect(mocks.post).toHaveBeenCalledWith('/notifications/device-token', {
      token: 'tok-1',
      platform: 'android',
    });
  });
});
