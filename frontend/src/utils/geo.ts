import { Capacitor } from '@capacitor/core';

export interface GeoCoords {
  latitude: number;
  longitude: number;
  accuracy?: number;
}

export interface GeoOptions {
  enableHighAccuracy?: boolean;
  timeout?: number;
  maximumAge?: number;
}

/**
 * Ambil posisi GPS lintas-platform (best-effort, tidak pernah throw).
 * - NATIVE (Capacitor/Android-iOS): pakai plugin @capacitor/geolocation — ini yang
 *   memunculkan dialog IZIN LOKASI native & membaca GPS perangkat. `navigator.
 *   geolocation` di WebView TIDAK memunculkan prompt tanpa ini.
 * - WEB: pakai navigator.geolocation (prompt browser).
 * Resolve `null` bila izin ditolak / tidak didukung / timeout, agar pengisian
 * survei tetap berjalan.
 */
export async function getPosition(opts: GeoOptions = {}): Promise<GeoCoords | null> {
  const enableHighAccuracy = opts.enableHighAccuracy ?? true;
  const timeout = opts.timeout ?? 10000;
  const maximumAge = opts.maximumAge ?? 0;

  if (Capacitor.isNativePlatform()) {
    try {
      const { Geolocation } = await import('@capacitor/geolocation');
      const perm = await Geolocation.requestPermissions();
      const granted = perm.location === 'granted' || perm.coarseLocation === 'granted';
      if (!granted) return null;
      const pos = await Geolocation.getCurrentPosition({
        enableHighAccuracy,
        timeout,
        maximumAge,
      });
      return {
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy ?? undefined,
      };
    } catch {
      return null;
    }
  }

  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy ?? undefined,
        }),
      () => resolve(null),
      { enableHighAccuracy, timeout, maximumAge },
    );
  });
}
