import { Capacitor } from '@capacitor/core';
import { api } from '@/services/api';

/**
 * Pengecekan versi app native (Android). Web tidak perlu: PWA memperbarui diri
 * sendiri (PWAReloadPrompt). App Android memuat web yang DIBUNDEL di APK, jadi
 * perbaikan tampilan baru sampai setelah pengguna memasang APK baru.
 *
 * Sumber kebenaran: GET /api/app/version (diisi admin di "Rilis Aplikasi").
 */
export interface AppVersionInfo {
  platform: string;
  latestVersionCode: number | null;
  latestVersionName: string | null;
  /** versionCode di bawah ini wajib update. 0 = tidak ada versi minimum. */
  minSupportedVersionCode: number;
  downloadUrl: string | null;
  releaseNotes: string | null;
  publishedAt: string | null;
}

export type UpdateStatus = 'none' | 'optional' | 'required';

const CACHE_KEY = 'populi.appUpdate.lastInfo';
const SNOOZE_KEY = 'populi.appUpdate.snooze';
/** "Nanti" menunda tawaran update opsional selama ini (per versi). */
export const SNOOZE_MS = 24 * 60 * 60 * 1000;

/** Status update untuk versionCode app ini. */
export function evaluateUpdate(
  currentCode: number | null,
  info: AppVersionInfo | null,
): UpdateStatus {
  if (!info || currentCode === null || !Number.isFinite(currentCode)) return 'none';
  if (info.minSupportedVersionCode > 0 && currentCode < info.minSupportedVersionCode) {
    return 'required';
  }
  if (info.latestVersionCode !== null && currentCode < info.latestVersionCode) return 'optional';
  return 'none';
}

/** versionCode app native (`App.getInfo().build`), null di web/bila tak terbaca. */
export async function getNativeVersionCode(): Promise<number | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const { App } = await import('@capacitor/app');
    const { build } = await App.getInfo();
    const code = Number.parseInt(build, 10);
    return Number.isFinite(code) ? code : null;
  } catch {
    return null;
  }
}

/** Platform native yang punya rilis di backend; null untuk web. */
export function nativeUpdatePlatform(): 'android' | null {
  return Capacitor.getPlatform() === 'android' ? 'android' : null;
}

export async function fetchAppVersion(platform: 'android'): Promise<AppVersionInfo> {
  const info = await api.get<AppVersionInfo>(`/app/version?platform=${platform}`);
  saveCachedInfo(info);
  return info;
}

/**
 * Info versi terakhir yang berhasil diambil. Dipakai saat app dibuka tanpa
 * internet, supaya layar wajib update tetap tampil (data lokal seperti antrean
 * offline tetap aman: memperbarui APK tidak menghapus data app).
 */
export function loadCachedInfo(): AppVersionInfo | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AppVersionInfo;
    return typeof parsed?.minSupportedVersionCode === 'number' ? parsed : null;
  } catch {
    return null;
  }
}

/** Dikirim setiap info versi baru diambil (kartu "Versi baru" di beranda ikut segar). */
export const APP_VERSION_EVENT = 'populi:app-version';

function saveCachedInfo(info: AppVersionInfo): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(info));
  } catch {
    /* penyimpanan penuh/diblokir → cukup tanpa cache */
  }
  window.dispatchEvent(new Event(APP_VERSION_EVENT));
}

/** True bila tawaran update opsional untuk versi ini sedang ditunda. */
export function isSnoozed(versionCode: number | null, now = Date.now()): boolean {
  if (versionCode === null) return false;
  try {
    const raw = localStorage.getItem(SNOOZE_KEY);
    if (!raw) return false;
    const s = JSON.parse(raw) as { versionCode?: number; until?: number };
    return s.versionCode === versionCode && typeof s.until === 'number' && s.until > now;
  } catch {
    return false;
  }
}

export function snoozeUpdate(versionCode: number, now = Date.now()): void {
  try {
    localStorage.setItem(SNOOZE_KEY, JSON.stringify({ versionCode, until: now + SNOOZE_MS }));
  } catch {
    /* gagal simpan → tawaran muncul lagi saat app dibuka, tidak masalah */
  }
}

/** Hanya https tanpa kredensial (domain dibatasi lagi di backend). */
export function isSafeDownloadUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && !u.username && !u.password;
  } catch {
    return false;
  }
}

/**
 * Buka halaman unduhan / listing Google Play di LUAR app. Di Android, Capacitor
 * meneruskan URL eksternal ke sistem (Intent VIEW): link populicenter.org ke
 * browser, link play.google.com langsung ke aplikasi Play Store.
 */
export function openDownloadUrl(url: string | null | undefined): boolean {
  if (!isSafeDownloadUrl(url)) return false;
  if (Capacitor.isNativePlatform()) {
    window.open(url, '_blank');
  } else {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
  return true;
}
