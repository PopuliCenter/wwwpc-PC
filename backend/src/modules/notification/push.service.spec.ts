import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import { PushService } from './push.service';

const mocks = vi.hoisted(() => ({
  sendEachForMulticast: vi.fn(),
}));

vi.mock('firebase-admin/app', () => ({
  initializeApp: vi.fn(() => ({ name: 'survei-push' })),
  cert: vi.fn((c: unknown) => c),
  getApps: vi.fn(() => []),
}));
vi.mock('firebase-admin/messaging', () => ({
  getMessaging: vi.fn(() => ({ sendEachForMulticast: mocks.sendEachForMulticast })),
}));

function makeService(serviceAccount: string | undefined): PushService {
  const config = { get: vi.fn(() => serviceAccount) };
  return new PushService(config as unknown as ConfigService);
}

describe('PushService', () => {
  beforeEach(() => {
    mocks.sendEachForMulticast.mockReset();
  });

  it('nonaktif tanpa FIREBASE_SERVICE_ACCOUNT dan tidak mengirim apa pun', async () => {
    const service = makeService(undefined);
    expect(service.isEnabled()).toBe(false);
    await expect(service.sendToTokens(['tok-1'], { title: 't', body: 'b' })).resolves.toEqual({
      sent: 0,
      failedTokens: [],
    });
    expect(mocks.sendEachForMulticast).not.toHaveBeenCalled();
  });

  it('payload Android memakai channel & nada khas yang dibuat aplikasi', async () => {
    mocks.sendEachForMulticast.mockResolvedValue({
      successCount: 1,
      responses: [{ success: true }],
    });
    const service = makeService('{"project_id":"uji"}');

    const res = await service.sendToTokens(['tok-1'], {
      title: 'Survei baru',
      body: 'Ayo isi',
      data: { link: '/surveys/abc/fill' },
    });

    expect(res).toEqual({ sent: 1, failedTokens: [] });
    const msg = mocks.sendEachForMulticast.mock.calls[0][0];
    expect(msg.tokens).toEqual(['tok-1']);
    expect(msg.notification).toEqual({ title: 'Survei baru', body: 'Ayo isi' });
    expect(msg.data).toEqual({ link: '/surveys/abc/fill' });
    // Kontrak dengan aplikasi Android: id channel = CHANNEL_ID di frontend
    // notifications.ts, sound = nama berkas res/raw/populi_notif.wav tanpa ekstensi.
    expect(msg.android.priority).toBe('high');
    expect(msg.android.notification).toMatchObject({
      channelId: 'populi_pemberitahuan',
      sound: 'populi_notif',
      priority: 'high',
    });
    // defaultSound=true akan menimpa nada khas dengan bunyi bawaan (Android 7).
    expect(msg.android.notification.defaultSound).toBeUndefined();
    expect(msg.apns).toEqual({ payload: { aps: { sound: 'default' } } });
  });

  it('mengembalikan token tak valid untuk dibersihkan', async () => {
    mocks.sendEachForMulticast.mockResolvedValue({
      successCount: 1,
      responses: [
        { success: true },
        { success: false, error: { code: 'messaging/registration-token-not-registered' } },
        { success: false, error: { code: 'messaging/internal-error' } },
      ],
    });
    const service = makeService('{"project_id":"uji"}');

    const res = await service.sendToTokens(['tok-1', 'tok-2', 'tok-3'], { title: 't', body: 'b' });

    expect(res).toEqual({ sent: 1, failedTokens: ['tok-2'] });
  });
});
