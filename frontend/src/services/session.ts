import { revokeServerSession } from '@/services/api';
import { releaseNativePush } from '@/services/notifications';
import { queryClient } from '@/services/queryClient';
import { useAuthStore } from '@/stores/auth.store';
import { usePointsStore } from '@/stores/points.store';
import { clearOfflineData, queueForUser } from '@/utils/offlineQueue';

/**
 * Nama Cache Storage yang dulu dipakai service worker untuk respons GET /api
 * (runtimeCaching NetworkFirst, sudah dihapus). Ikut dihapus di sini dan di
 * `public/sw-cleanup.js` karena bisa berisi PII, berkas ekspor, media, dan
 * request beserta header Authorization.
 */
export const LEGACY_API_CACHES = ['api-get-cache'];

/**
 * Hapus semua cache Cache Storage yang BUKAN precache app-shell Workbox. Precache
 * hanya berisi aset build (HTML/JS/CSS/ikon) yang sama untuk semua pengguna, jadi
 * dibiarkan agar aplikasi tetap bisa dibuka offline. Tidak pernah melempar.
 */
export async function clearUserCaches(): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    const keys = await caches.keys();
    await Promise.all(
      keys.filter((k) => !k.startsWith('workbox-precache')).map((k) => caches.delete(k)),
    );
  } catch {
    /* Cache Storage tak tersedia (mis. konteks tidak aman) → abaikan */
  }
}

/** Jumlah respons offline milik user aktif yang BELUM terkirim (untuk peringatan logout). */
export async function pendingOfflineCount(): Promise<number> {
  const userId = useAuthStore.getState().user?.id;
  if (!userId) return 0;
  try {
    return (await queueForUser(userId)).length;
  } catch {
    return 0;
  }
}

export interface SignOutOptions {
  /**
   * false = jangan cabut sesi di server (mis. akun baru saja dihapus: sesinya
   * sudah tak berlaku). Default true.
   */
  notifyServer?: boolean;
}

/**
 * Logout menyeluruh (T-08/T-20/T-21). Urutan penting: panggilan server dulu
 * (butuh token), baru data lokal dibersihkan.
 *  1. lepas token push perangkat (native) — lihat releaseNativePush;
 *  2. cabut sesi di server: POST /auth/logout (refresh token ikut tak berlaku);
 *  3. hapus Cache Storage non-precache (sisa cache /api lama);
 *  4. kosongkan IndexedDB offline (antrean, media, cache data survei);
 *  5. kosongkan cache TanStack Query & saldo poin di memori;
 *  6. hapus token & user dari localStorage + state auth.
 * Langkah jaringan best-effort dengan batas waktu; logout lokal SELALU terjadi.
 */
export async function signOut(options: SignOutOptions = {}): Promise<void> {
  const { notifyServer = true } = options;
  // Lepas push di perangkat juga saat hapus akun (token lokal FCM dihapus).
  await releaseNativePush().catch(() => undefined);
  if (notifyServer) await revokeServerSession().catch(() => undefined);
  await clearUserCaches();
  await clearOfflineData().catch(() => undefined);
  queryClient.clear();
  usePointsStore.getState().setAvailable(null);
  useAuthStore.getState().logout();
}
