import { Capacitor } from '@capacitor/core';
import { router } from '@/router';
import { api } from '@/services/api';
import { showAppNotice } from '@/stores/notification.store';

/**
 * Inisialisasi notifikasi NATIVE (push) saat aplikasi berjalan di dalam shell
 * Capacitor (Android/iOS). Di web biasa ini TIDAK melakukan apa-apa — pop-up
 * in-app tetap berfungsi lewat `showAppNotice`.
 *
 * Perilaku:
 *  - minta izin & daftar ke FCM/APNs → kirim device token ke backend;
 *  - push tiba saat aplikasi DI DEPAN → tampilkan pop-up in-app (NotificationHost);
 *  - push diketuk (background) → buka rute tujuan (mis. /surveys/<id>/fill).
 *
 * Aman dipanggil berkali-kali (idempoten) dan tidak melempar error ke UI.
 */
let initialized = false;

export async function initNativeNotifications(): Promise<void> {
  if (initialized) return;
  if (!Capacitor.isNativePlatform()) return; // web → tidak perlu push native
  initialized = true;

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');

    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== 'granted') {
      return; // pengguna menolak izin notifikasi
    }

    // Token perangkat dari FCM/APNs → simpan di backend untuk pengiriman push.
    PushNotifications.addListener('registration', (token) => {
      void api
        .post('/notifications/device-token', {
          token: token.value,
          platform: Capacitor.getPlatform(), // 'android' | 'ios'
        })
        .catch(() => {
          /* gagal kirim token tidak boleh mengganggu UI */
        });
    });

    PushNotifications.addListener('registrationError', () => {
      /* abaikan; bisa dicoba lagi saat sesi berikutnya */
    });

    // Push tiba saat aplikasi DI DEPAN → tampilkan sebagai pop-up in-app.
    PushNotifications.addListener('pushNotificationReceived', (notif) => {
      const link = (notif.data?.link as string | undefined) ?? undefined;
      showAppNotice({
        title: notif.title ?? 'Pemberitahuan',
        body: notif.body ?? undefined,
        link,
        tone: 'info',
      });
    });

    // Pengguna mengetuk notifikasi (aplikasi di belakang/tertutup) → buka rute.
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      const link = action.notification.data?.link as string | undefined;
      if (link) router.navigate(link);
    });

    await PushNotifications.register();
  } catch {
    // Plugin tidak tersedia / lingkungan bukan native → abaikan diam-diam.
    initialized = false;
  }
}
