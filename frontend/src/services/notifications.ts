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
 *  - buat CHANNEL prioritas tinggi → notifikasi muncul HEADS-UP (pop di layar HP);
 *  - push tiba → OS menampilkan notifikasi sistem dari payload FCM (sekali);
 *  - push tiba saat app DI DEPAN → TAMBAHAN pop-up in-app (showAppNotice). App
 *    TIDAK membuat local notification lagi agar tidak muncul notif GANDA;
 *  - notifikasi diketuk → buka rute tujuan (mis. /surveys/<id>/fill).
 *
 * Aman dipanggil berkali-kali (idempoten) dan tidak melempar error ke UI.
 */
let initialized = false;

// HARUS sama dengan channelId yang dikirim backend (push.service.ts) agar
// notifikasi memakai channel prioritas tinggi ini (heads-up + suara).
const CHANNEL_ID = 'survei_penting';

/**
 * Navigasi aman dari notifikasi: hanya path INTERNAL (diawali '/'). Link kosong
 * atau URL eksternal/aneh diabaikan agar tidak memicu 404. Tetap aman bila
 * pengumuman dikirim tanpa link / dengan link salah.
 */
function navigateToLink(link: string | undefined): void {
  if (typeof link === 'string' && link.startsWith('/')) {
    router.navigate(link);
  }
}

// Token FCM terakhir yang diterima. Disimpan agar bisa dikirim ULANG ke backend
// setelah login — token sering tiba SAAT masih di layar login (belum ada sesi),
// sehingga POST pertamanya 401 dan token tak tersimpan untuk user mana pun.
let fcmToken: string | null = null;

async function postDeviceToken(token: string): Promise<void> {
  await api
    .post('/notifications/device-token', {
      token,
      platform: Capacitor.getPlatform(), // 'android' | 'ios'
    })
    .catch(() => {
      /* gagal kirim token tidak boleh mengganggu UI */
    });
}

/**
 * Kirim ulang device token untuk user yang SEDANG login. Dipanggil setelah login
 * berhasil (lihat App.tsx) agar token yang sempat gagal terkirim (karena belum
 * login) kini tersimpan & terkait user → push bisa sampai. Aman & idempoten.
 */
export async function syncDeviceToken(): Promise<void> {
  if (!Capacitor.isNativePlatform() || !fcmToken) return;
  await postDeviceToken(fcmToken);
}

/** Buat channel Android prioritas tinggi (heads-up). iOS tidak punya channel. */
async function ensureAndroidChannel(): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') return;
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    await PushNotifications.createChannel({
      id: CHANNEL_ID,
      name: 'Notifikasi Penting',
      description: 'Survei baru, pengumuman, dan pengingat',
      importance: 5, // MAX → muncul heads-up di layar + bunyi
      visibility: 1, // tampil di layar kunci
      vibration: true,
      lights: true,
    });
  } catch {
    /* channel gagal dibuat → notifikasi tetap jalan di channel default */
  }
}

export async function initNativeNotifications(): Promise<void> {
  if (initialized) return;
  if (!Capacitor.isNativePlatform()) return; // web → tidak perlu push native

  // Push native BUTUH konfigurasi Firebase (google-services.json di
  // android/app/). Tanpa itu, PushNotifications.register() memicu CRASH NATIVE
  // ("Default FirebaseApp is not initialized") yang TIDAK tertangkap try/catch JS
  // → aplikasi keluar sendiri. Maka aktif HANYA bila Firebase sudah disiapkan,
  // ditandai env VITE_ENABLE_PUSH=true saat build. Default: nonaktif (aman).
  // Pop-up in-app (showAppNotice/NotificationHost) tetap berfungsi tanpa ini.
  if (import.meta.env.VITE_ENABLE_PUSH !== 'true') return;

  initialized = true;

  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');

    const perm = await PushNotifications.requestPermissions();
    if (perm.receive !== 'granted') {
      return; // pengguna menolak izin notifikasi
    }

    // Channel prioritas tinggi agar notifikasi muncul heads-up (pop di layar).
    await ensureAndroidChannel();

    // Token perangkat dari FCM/APNs → simpan & kirim ke backend. Token juga
    // disimpan agar bisa dikirim ulang setelah login (lihat syncDeviceToken).
    PushNotifications.addListener('registration', (token) => {
      fcmToken = token.value;
      void postDeviceToken(token.value);
    });

    PushNotifications.addListener('registrationError', () => {
      /* abaikan; bisa dicoba lagi saat sesi berikutnya */
    });

    // Push tiba saat aplikasi DI DEPAN → HANYA pop-up in-app. OS sudah menampilkan
    // notifikasi sistem dari payload FCM; TIDAK membuat local notification lagi
    // (dulu memicu notif GANDA di status bar).
    PushNotifications.addListener('pushNotificationReceived', (notif) => {
      showAppNotice({
        title: notif.title ?? 'Pemberitahuan',
        body: notif.body ?? undefined,
        link: (notif.data?.link as string | undefined) ?? undefined,
        tone: 'info',
      });
    });

    // Notifikasi push diketuk (app di belakang/tertutup/depan) → buka rute.
    PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      navigateToLink(action.notification.data?.link as string | undefined);
    });

    await PushNotifications.register();
  } catch {
    // Plugin tidak tersedia / lingkungan bukan native → abaikan diam-diam.
    initialized = false;
  }
}
