import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

type Handler = (payload: unknown) => void;

const mocks = vi.hoisted(() => ({
  handlers: {} as Record<string, (payload: unknown) => void>,
  platform: 'android' as 'android' | 'ios' | 'web',
  showAppNotice: vi.fn(),
  requestFeedRefresh: vi.fn(),
  navigate: vi.fn(),
  post: vi.fn(() => Promise.resolve()),
  createChannel: vi.fn(() => Promise.resolve()),
  deleteChannel: vi.fn(() => Promise.resolve()),
  listChannels: vi.fn(() =>
    Promise.resolve({ channels: [] as Array<{ id: string; importance?: number }> }),
  ),
  requestPermissions: vi.fn(() => Promise.resolve({ receive: 'granted' })),
  register: vi.fn(() => Promise.resolve()),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => mocks.platform !== 'web',
    getPlatform: () => mocks.platform,
  },
}));
vi.mock('@capacitor/push-notifications', () => ({
  PushNotifications: {
    requestPermissions: mocks.requestPermissions,
    createChannel: mocks.createChannel,
    deleteChannel: mocks.deleteChannel,
    listChannels: mocks.listChannels,
    register: mocks.register,
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

describe('channel notifikasi Android', () => {
  // Modul dimuat ulang per tes: flag `initialized` di notifications.ts bersifat
  // per-modul, jadi tanpa ini channel hanya dibuat pada pemanggilan pertama.
  async function initFresh(): Promise<void> {
    vi.resetModules();
    const { initNativeNotifications } = await import('./notifications');
    await initNativeNotifications();
  }

  beforeEach(() => {
    vi.stubEnv('VITE_ENABLE_PUSH', 'true');
    mocks.platform = 'android';
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
    mocks.platform = 'android';
  });

  it('membuat channel bernada khas, menghapus channel lama, lalu baru register', async () => {
    await initFresh();

    // id HARUS sama dengan channelId backend (push.service.ts) & meta-data manifest.
    expect(mocks.createChannel).toHaveBeenCalledTimes(1);
    expect(mocks.createChannel).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'populi_pemberitahuan',
        name: 'Pemberitahuan',
        importance: 5,
        sound: 'populi_notif.wav',
        vibration: true,
        lights: true,
      }),
    );
    // Channel lama DAN channel cadangan FCM ("Misc") sama-sama dihapus.
    expect(mocks.deleteChannel).toHaveBeenCalledTimes(2);
    expect(mocks.deleteChannel).toHaveBeenCalledWith({ id: 'survei_penting' });
    expect(mocks.deleteChannel).toHaveBeenCalledWith({
      id: 'fcm_fallback_notification_channel',
    });

    const created = mocks.createChannel.mock.invocationCallOrder[0];
    const firstDeleted = Math.min(...mocks.deleteChannel.mock.invocationCallOrder);
    const lastDeleted = Math.max(...mocks.deleteChannel.mock.invocationCallOrder);
    const registered = mocks.register.mock.invocationCallOrder[0];
    expect(created).toBeLessThan(firstDeleted);
    expect(lastDeleted).toBeLessThan(registered);
  });

  it('channel lama yang dimatikan pengguna → channel baru ikut mati', async () => {
    mocks.listChannels.mockResolvedValueOnce({
      channels: [
        { id: 'survei_penting', importance: 0 },
        { id: 'fcm_fallback_notification_channel', importance: 3 },
      ],
    });
    await initFresh();
    expect(mocks.createChannel).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'populi_pemberitahuan', importance: 0 }),
    );
    // Tingkat dibaca SEBELUM channel lama dihapus.
    expect(mocks.listChannels.mock.invocationCallOrder[0]).toBeLessThan(
      Math.min(...mocks.deleteChannel.mock.invocationCallOrder),
    );
  });

  it('channel lama yang dibiarkan MAX atau daftar channel gagal dibaca → tetap MAX', async () => {
    mocks.listChannels.mockResolvedValueOnce({
      channels: [{ id: 'survei_penting', importance: 5 }],
    });
    await initFresh();
    expect(mocks.createChannel).toHaveBeenLastCalledWith(
      expect.objectContaining({ importance: 5 }),
    );

    mocks.listChannels.mockRejectedValueOnce(new Error('tidak didukung'));
    await initFresh();
    expect(mocks.createChannel).toHaveBeenLastCalledWith(
      expect.objectContaining({ importance: 5 }),
    );
    expect(mocks.register).toHaveBeenCalledTimes(2);
  });

  it('gagal menghapus channel lama tidak menghentikan pendaftaran push', async () => {
    mocks.deleteChannel.mockRejectedValueOnce(new Error('channel tidak ada'));
    await initFresh();
    expect(mocks.register).toHaveBeenCalledTimes(1);
  });

  it('iOS tidak menyentuh channel Android', async () => {
    mocks.platform = 'ios';
    await initFresh();
    expect(mocks.createChannel).not.toHaveBeenCalled();
    expect(mocks.deleteChannel).not.toHaveBeenCalled();
    expect(mocks.register).toHaveBeenCalledTimes(1);
  });

  it('web biasa tidak memanggil plugin push sama sekali', async () => {
    mocks.platform = 'web';
    await initFresh();
    expect(mocks.requestPermissions).not.toHaveBeenCalled();
    expect(mocks.createChannel).not.toHaveBeenCalled();
  });
});
