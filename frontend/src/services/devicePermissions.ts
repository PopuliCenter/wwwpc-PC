import { Capacitor, registerPlugin } from '@capacitor/core';
import { initNativeNotifications } from '@/services/notifications';

/**
 * Status izin perangkat untuk kartu ajakan di beranda responden (PermissionPrompts):
 * notifikasi mati, izin lokasi belum ada, atau GPS HP mati. Hanya app Android.
 *
 * Plugin native PopuliSettings (PopuliSettingsPlugin.java) membaca status yang tidak
 * tersedia di plugin Capacitor bawaan dan membuka halaman Setelan yang tepat. APK lama
 * tanpa plugin itu tetap aman: pemanggilan gagal → jatuh ke plugin bawaan / diam saja.
 */
interface PopuliSettingsPlugin {
  getStatus(): Promise<{ notificationsEnabled: boolean; locationEnabled: boolean }>;
  openSettings(options: { target: SettingsTarget }): Promise<void>;
}

type SettingsTarget = 'notifications' | 'location' | 'app';
export type LocationState = 'ok' | 'permission' | 'service-off';

let settingsPlugin: PopuliSettingsPlugin | null = null;
function nativeSettings(): PopuliSettingsPlugin {
  settingsPlugin ??= registerPlugin<PopuliSettingsPlugin>('PopuliSettings');
  return settingsPlugin;
}

async function nativeStatus(): Promise<{
  notificationsEnabled?: boolean;
  locationEnabled?: boolean;
}> {
  try {
    return await nativeSettings().getStatus();
  } catch {
    return {}; // APK lama tanpa plugin PopuliSettings
  }
}

async function openSettings(target: SettingsTarget): Promise<void> {
  try {
    await nativeSettings().openSettings({ target });
  } catch {
    /* APK lama / Setelan tak tersedia → tidak ada yang bisa dilakukan */
  }
}

export function isAndroidApp(): boolean {
  return Capacitor.getPlatform() === 'android';
}

/** Push hanya aktif di build yang menyertakan Firebase (VITE_ENABLE_PUSH=true). */
export function pushSupported(): boolean {
  return isAndroidApp() && import.meta.env.VITE_ENABLE_PUSH === 'true';
}

/** True bila notifikasi app ini mati (izin ditolak ATAU dimatikan di Setelan). */
export async function notificationsOff(): Promise<boolean> {
  if (!pushSupported()) return false;
  const status = await nativeStatus();
  if (typeof status.notificationsEnabled === 'boolean') return !status.notificationsEnabled;
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    return (await PushNotifications.checkPermissions()).receive !== 'granted';
  } catch {
    return false;
  }
}

/** Nyalakan notifikasi: minta izin bila masih bisa, selain itu buka Setelan notifikasi. */
export async function enableNotifications(): Promise<void> {
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    const { receive } = await PushNotifications.checkPermissions();
    if (receive === 'prompt' || receive === 'prompt-with-rationale') {
      // Meminta izin + mendaftar token push bila diizinkan.
      await initNativeNotifications();
      return;
    }
  } catch {
    /* jatuh ke Setelan */
  }
  // Izin ditolak permanen, atau izin ada tetapi notifikasi dimatikan di Setelan.
  await openSettings('notifications');
}

/**
 * - 'service-off': lokasi (GPS) HP sedang mati;
 * - 'permission': app belum diizinkan membaca lokasi;
 * - 'ok': siap, atau status tak terbaca (jangan mengganggu).
 */
export async function locationState(): Promise<LocationState> {
  if (!isAndroidApp()) return 'ok';
  const status = await nativeStatus();
  if (status.locationEnabled === false) return 'service-off';
  try {
    const { Geolocation } = await import('@capacitor/geolocation');
    const perm = await Geolocation.checkPermissions();
    return perm.location === 'granted' || perm.coarseLocation === 'granted' ? 'ok' : 'permission';
  } catch {
    // Plugin Geolocation menolak checkPermissions saat layanan lokasi mati.
    return status.locationEnabled === undefined ? 'ok' : 'service-off';
  }
}

/** Nyalakan GPS / minta izin lokasi; izin yang ditolak permanen → Setelan aplikasi. */
export async function enableLocation(state: LocationState): Promise<void> {
  if (state === 'service-off') {
    await openSettings('location');
    return;
  }
  try {
    const { Geolocation } = await import('@capacitor/geolocation');
    const perm = await Geolocation.checkPermissions();
    if (perm.location === 'denied' && perm.coarseLocation === 'denied') {
      await openSettings('app');
      return;
    }
    await Geolocation.requestPermissions({ permissions: ['location'] });
  } catch {
    await openSettings('app');
  }
}

// ── Tunda kartu ("×") ────────────────────────────────────────────────────────

const DISMISS_KEY = 'populi.prompts.dismissed';
/** "×" pada kartu izin menunda kartu itu selama ini. */
export const PERMISSION_SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
/** "×" pada kartu versi baru (per versi). */
export const UPDATE_SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;

function readDismissed(): Record<string, number> {
  try {
    const parsed = JSON.parse(localStorage.getItem(DISMISS_KEY) ?? '{}') as unknown;
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, number>) : {};
  } catch {
    return {};
  }
}

export function isPromptDismissed(key: string, now = Date.now()): boolean {
  const until = readDismissed()[key];
  return typeof until === 'number' && until > now;
}

export function dismissPrompt(key: string, ms: number, now = Date.now()): void {
  try {
    const map = readDismissed();
    // Buang entri kedaluwarsa agar kunci per-versi tidak menumpuk.
    for (const k of Object.keys(map)) if (map[k] <= now) delete map[k];
    map[key] = now + ms;
    localStorage.setItem(DISMISS_KEY, JSON.stringify(map));
  } catch {
    /* gagal simpan → kartu muncul lagi saat beranda dibuka, tidak masalah */
  }
}
