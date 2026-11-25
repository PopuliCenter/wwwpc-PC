/** Platform native yang punya pengecekan versi. */
export const APP_PLATFORMS = ['android'] as const;
export type AppPlatform = (typeof APP_PLATFORMS)[number];

/**
 * Domain unduhan bawaan (bisa ditimpa env APP_DOWNLOAD_ALLOWED_HOSTS, dipisah
 * koma). Subdomain ikut diizinkan (www.populicenter.org). Link unduhan dari
 * admin WAJIB https ke salah satu domain ini — app membukanya apa adanya,
 * jadi allowlist mencegah link nyasar/phishing bila akun admin disalahgunakan.
 */
export const DEFAULT_DOWNLOAD_HOSTS = ['populicenter.org', 'play.google.com'];

/** Rute app yang dibuka saat notifikasi update diketuk. */
export const APP_UPDATE_ROUTE = '/app-update';

/** Lama cache in-memory info versi (endpoint publik dipanggil tiap app dibuka). */
export const VERSION_CACHE_MS = 30_000;
