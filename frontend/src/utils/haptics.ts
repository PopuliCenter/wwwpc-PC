/**
 * Umpan balik getar (haptic) untuk aksi penting — hanya di aplikasi native
 * (Android/iOS via Capacitor). Di web / bila plugin tak tersedia → no-op senyap,
 * jadi aman dipanggil dari mana saja tanpa cek platform.
 *
 * Pemakaian:
 *   haptic();            // ketukan ringan (default) — tombol
 *   haptic('success');   // pola sukses — submit survei / reward berhasil
 *   haptic('error');     // pola gagal
 */
import { Capacitor } from '@capacitor/core';

type HapticKind = 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error';

export async function haptic(kind: HapticKind = 'light'): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  try {
    const { Haptics, ImpactStyle, NotificationType } = await import('@capacitor/haptics');
    if (kind === 'success' || kind === 'warning' || kind === 'error') {
      const map = {
        success: NotificationType.Success,
        warning: NotificationType.Warning,
        error: NotificationType.Error,
      } as const;
      await Haptics.notification({ type: map[kind] });
    } else {
      const map = {
        light: ImpactStyle.Light,
        medium: ImpactStyle.Medium,
        heavy: ImpactStyle.Heavy,
      } as const;
      await Haptics.impact({ style: map[kind] });
    }
  } catch {
    // Plugin tak terpasang / perangkat tak mendukung → abaikan.
  }
}
