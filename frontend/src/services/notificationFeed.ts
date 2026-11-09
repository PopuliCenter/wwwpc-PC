import { Capacitor } from '@capacitor/core';

/**
 * Sinyal kecil "feed notifikasi berubah" untuk lonceng (badge) dan halaman
 * Notifikasi. Keduanya mengambil data sendiri (bukan react-query), jadi cukup
 * diberi tahu kapan harus mengambil ulang:
 *  - 'changed': ada kemungkinan notifikasi baru → ambil ulang. Dipicu push yang
 *    tiba saat aplikasi di depan, dan saat aplikasi/tab kembali ke depan (push
 *    yang datang saat di belakang hanya masuk status bar, feed di layar basi).
 *  - 'read': feed baru saja ditandai dibaca di tempat lain → badge langsung nol.
 *
 * Bukan polling: tidak ada timer berulang di sini. Web tanpa native tetap jalan
 * (hanya memakai visibilitychange).
 */
export type FeedEvent = 'changed' | 'read';
type FeedListener = (event: FeedEvent) => void;

const listeners = new Set<FeedListener>();

// Push dan resume sering datang hampir bersamaan (mis. notifikasi diketuk membuka
// aplikasi; di Android visibilitychange dan App 'resume' sama-sama terpicu):
// gabungkan jadi SATU pengambilan ulang.
const DEBOUNCE_MS = 300;
// Jeda minimum antar-refresh karena kembali ke depan, agar bolak-balik tab atau
// aplikasi beruntun tidak membanjiri server.
const FOREGROUND_MIN_GAP_MS = 5_000;

let pending: ReturnType<typeof setTimeout> | null = null;
let lastForegroundAt = 0;
let watchingForeground = false;

function emit(event: FeedEvent): void {
  listeners.forEach((listener) => {
    try {
      listener(event);
    } catch {
      /* satu pendengar gagal tidak boleh menghentikan yang lain */
    }
  });
}

/** Minta lonceng & halaman Notifikasi mengambil ulang feed (digabung bila beruntun). */
export function requestFeedRefresh(): void {
  if (pending) clearTimeout(pending);
  pending = setTimeout(() => {
    pending = null;
    emit('changed');
  }, DEBOUNCE_MS);
}

/** Kabari bahwa semua notifikasi baru saja ditandai dibaca (badge → 0). */
export function announceFeedRead(): void {
  emit('read');
}

function onForeground(): void {
  const now = Date.now();
  if (now - lastForegroundAt < FOREGROUND_MIN_GAP_MS) return;
  lastForegroundAt = now;
  requestFeedRefresh();
}

/** Pasang pendengar "kembali ke depan" sekali saja. */
function watchForeground(): void {
  if (watchingForeground || typeof document === 'undefined') return;
  watchingForeground = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') onForeground();
  });
  if (Capacitor.isNativePlatform()) {
    void import('@capacitor/app')
      .then(({ App }) => App.addListener('resume', onForeground))
      .catch(() => {
        /* plugin tak tersedia → visibilitychange tetap menangani */
      });
  }
}

/** Dengarkan perubahan feed. Mengembalikan fungsi pelepas (cocok untuk useEffect). */
export function subscribeFeed(listener: FeedListener): () => void {
  watchForeground();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
