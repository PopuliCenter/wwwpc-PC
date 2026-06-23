import { Capacitor } from '@capacitor/core';

/**
 * Versi aplikasi yang ditampilkan ke pengguna.
 *
 * - Native (Android): dibaca dari `versionName` aplikasi via @capacitor/app
 *   (`App.getInfo()`) — angka yang dinaikkan di build.gradle tiap rilis Play
 *   Store. Jadi "Versi" di app SELALU ikut versi rilis.
 * - Web: dari `package.json` (disuntik saat build sebagai __APP_VERSION__).
 *
 * Dipanggil sekali saat mount; sementara menunggu, pakai versi web sebagai
 * nilai awal agar tidak kosong.
 */
export const WEB_APP_VERSION = __APP_VERSION__;

export async function getAppVersion(): Promise<string> {
  if (Capacitor.isNativePlatform()) {
    try {
      const { App } = await import('@capacitor/app');
      const info = await App.getInfo();
      // info.version = versionName, info.build = versionCode.
      return info.build ? `${info.version} (${info.build})` : info.version;
    } catch {
      // Plugin tak tersedia → jatuh ke versi web.
    }
  }
  return WEB_APP_VERSION;
}
