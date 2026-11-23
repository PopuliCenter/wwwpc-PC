import { describe, it, expect, beforeEach, vi } from 'vitest';

const order: string[] = [];
const mocks = vi.hoisted(() => ({
  revokeServerSession: vi.fn(),
  releaseNativePush: vi.fn(),
  clearOfflineData: vi.fn(),
  queueForUser: vi.fn(),
  queryClear: vi.fn(),
}));

vi.mock('@/services/api', () => ({ revokeServerSession: mocks.revokeServerSession }));
vi.mock('@/services/notifications', () => ({ releaseNativePush: mocks.releaseNativePush }));
vi.mock('@/services/queryClient', () => ({ queryClient: { clear: mocks.queryClear } }));
vi.mock('@/stores/points.store', () => ({
  usePointsStore: { getState: () => ({ setAvailable: vi.fn() }) },
}));
vi.mock('@/utils/offlineQueue', () => ({
  clearOfflineData: mocks.clearOfflineData,
  queueForUser: mocks.queueForUser,
}));

import { clearUserCaches, pendingOfflineCount, signOut } from './session';
import { useAuthStore } from '@/stores/auth.store';
import type { User } from '@/types';

const user: User = {
  id: 'u-1',
  email: 'a@example.com',
  fullName: 'A',
  role: 'respondent',
  isActive: true,
};

function installCaches(names: string[]) {
  const store = new Set(names);
  const api = {
    keys: vi.fn(async () => [...store]),
    delete: vi.fn(async (k: string) => {
      order.push(`cache:${k}`);
      return store.delete(k);
    }),
  };
  Object.defineProperty(globalThis, 'caches', { value: api, configurable: true });
  return { store, api };
}

describe('signOut', () => {
  beforeEach(() => {
    order.length = 0;
    vi.clearAllMocks();
    localStorage.clear();
    mocks.releaseNativePush.mockImplementation(async () => void order.push('push'));
    mocks.revokeServerSession.mockImplementation(async () => {
      // Sesi dicabut SEBELUM token lokal dihapus (butuh Authorization).
      order.push(`revoke:${localStorage.getItem('accessToken')}`);
    });
    mocks.clearOfflineData.mockImplementation(async () => void order.push('idb'));
    mocks.queryClear.mockImplementation(() => void order.push('query'));
    useAuthStore.getState().login(user, 'acc-A', 'ref-A');
  });

  it('mencabut sesi server lalu membersihkan cache, IndexedDB, query, dan token', async () => {
    const { store } = installCaches([
      'workbox-precache-v2-https://x/',
      'api-get-cache',
      'other-runtime',
    ]);

    await signOut();

    expect(order[0]).toBe('push');
    expect(order[1]).toBe('revoke:acc-A');
    expect(order).toContain('cache:api-get-cache');
    expect(order).toContain('cache:other-runtime');
    expect(order).toContain('idb');
    expect(order).toContain('query');
    // Precache app-shell dipertahankan agar app tetap bisa dibuka offline.
    expect([...store]).toEqual(['workbox-precache-v2-https://x/']);

    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
    const s = useAuthStore.getState();
    expect(s.isAuthenticated).toBe(false);
    expect(s.user).toBeNull();
  });

  it('tetap logout lokal walau server & IndexedDB gagal', async () => {
    installCaches([]);
    mocks.revokeServerSession.mockRejectedValue(new Error('offline'));
    mocks.clearOfflineData.mockRejectedValue(new Error('idb blocked'));

    await signOut();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(localStorage.getItem('accessToken')).toBeNull();
  });

  it('notifyServer:false (hapus akun) tidak memanggil /auth/logout', async () => {
    installCaches([]);
    await signOut({ notifyServer: false });
    expect(mocks.revokeServerSession).not.toHaveBeenCalled();
    expect(mocks.releaseNativePush).toHaveBeenCalled();
    expect(mocks.clearOfflineData).toHaveBeenCalled();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});

describe('clearUserCaches', () => {
  it('aman bila Cache Storage tidak tersedia', async () => {
    Object.defineProperty(globalThis, 'caches', { value: undefined, configurable: true });
    await expect(clearUserCaches()).resolves.toBeUndefined();
  });
});

describe('pendingOfflineCount', () => {
  it('menghitung antrean milik user aktif saja', async () => {
    useAuthStore.getState().login(user, 'a', 'r');
    mocks.queueForUser.mockResolvedValue([{ localId: '1' }, { localId: '2' }]);
    expect(await pendingOfflineCount()).toBe(2);
    expect(mocks.queueForUser).toHaveBeenCalledWith('u-1');
  });

  it('0 bila tidak ada user', async () => {
    useAuthStore.getState().logout();
    expect(await pendingOfflineCount()).toBe(0);
  });
});
