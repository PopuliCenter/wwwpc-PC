import { Capacitor } from '@capacitor/core';
import type { Importance, PushNotificationsPlugin } from '@capacitor/push-notifications';
import { router } from '@/router';
import { api } from '@/services/api';
import { requestFeedRefresh } from '@/services/notificationFeed';
import { showAppNotice } from '@/stores/notification.store';

/**
 * Inisialisasi notifikasi NATIVE (push) saat aplikasi berjalan di dalam shell
 * Capacitor (Android/iOS). Di web biasa ini TIDAK melakukan apa-apa — pop-up
 * in-app tetap berfungsi lewat `showAppNotice`.
 *
 * Perilaku:
 *  - minta izin & daftar ke FCM/APNs → kirim device token ke backend;
 *  - buat CHANNEL prioritas tinggi bernada khas → notifikasi muncul HEADS-UP (pop
 *    di layar HP) dan berbunyi populi_notif; channel lama & channel cadangan FCM
 *    dihapus agar Setelan HP hanya berisi satu kategori dari push;
 *  - push tiba → notifikasi sistem dari payload FCM tampil SEKALI di channel itu:
 *    app di belakang/tertutup oleh SDK FCM, app di depan oleh plugin
 *    (presentationOptions 'alert' di capacitor.config.ts) → nada sama di semua keadaan;
 *  - push tiba saat app DI DEPAN → TAMBAHAN pop-up in-app (showAppNotice). App
 *    TIDAK membuat local notification lagi agar tidak muncul notif GANDA;
 *  - push tiba di depan → lonceng & halaman Notifikasi ikut segar
 *    (requestFeedRefresh, lihat notificationFeed.ts);
 *  - notifikasi diketuk → buka rute tujuan (mis. /surveys/<id>/fill).
 *
 * Aman dipanggil berkali-kali (idempoten) dan tidak melempar error ke UI.
 */
let initialized = false;

// HARUS sama dengan channelId yang dikirim backend (push.service.ts) dan meta-data
// default_notification_channel_id di AndroidManifest.xml agar notifikasi memakai
// channel prioritas tinggi ini (heads-up + nada khas).
// Bunyi channel Android TIDAK bisa diubah setelah channel dibuat, jadi ganti
// nada = ganti id channel. Berkas nada: android/app/src/main/res/raw/populi_notif.wav
// (dibuat scripts/generate-notif-sound.mjs).
const CHANNEL_ID = 'populi_pemberitahuan';
const CHANNEL_SOUND = 'populi_notif.wav';
const IMPORTANCE_MAX: Importance = 5; // heads-up di layar + bunyi

// Channel lama bernada bawaan yang digantikan CHANNEL_ID. Tingkat (importance)
// yang dipilih pengguna di channel ini dibawa ke channel baru, lihat ensureAndroidChannel.
const REPLACED_CHANNEL_ID = 'survei_penting';

// Channel yang dihapus agar tidak dobel di Setelan HP:
//  - survei_penting: channel lama bernada bawaan;
//  - fcm_fallback_notification_channel ("Misc"): dibuat SDK FCM bila push tiba
//    sebelum CHANNEL_ID ada (APK lama menerima push dari backend baru, atau APK baru
//    yang belum dibuka). Aman dihapus: FCM baru membuatnya lagi bila channel payload
//    DAN channel meta-data manifest sama-sama belum ada.
const LEGACY_CHANNEL_IDS = [REPLACED_CHANNEL_ID, 'fcm_fallback_notification_channel'];

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

/**
 * Tingkat channel baru. Android tidak memindahkan setelan pengguna antar-id channel,
 * jadi bila channel lama dulu dibisukan atau dimatikan (importance < MAX), tingkat
 * itu dipakai juga untuk channel baru agar pengguna tidak tiba-tiba diganggu lagi.
 */
async function inheritedImportance(push: PushNotificationsPlugin): Promise<Importance> {
  try {
    const { channels } = await push.listChannels();
    const old = channels.find((ch) => ch.id === REPLACED_CHANNEL_ID)?.importance;
    if (typeof old === 'number' && old >= 0 && old < IMPORTANCE_MAX) return old;
  } catch {
    /* daftar channel tak terbaca → pakai tingkat bawaan */
  }
  return IMPORTANCE_MAX;
}

/**
 * Buat channel Android prioritas tinggi (heads-up + nada khas) lalu hapus channel
 * lama. iOS tidak punya channel. Idempoten: createChannel dengan id yang sama
 * hanya memperbarui nama/deskripsi (Android tidak mengizinkan app MENAIKKAN
 * importance channel yang sudah ada, jadi tingkat warisan tetap bertahan setelah
 * channel lama terhapus), deleteChannel untuk id yang tak ada diabaikan OS.
 */
async function ensureAndroidChannel(): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') return;
  try {
    const { PushNotifications } = await import('@capacitor/push-notifications');
    await PushNotifications.createChannel({
      id: CHANNEL_ID,
      name: 'Pemberitahuan',
      description: 'Survei baru, pengumuman, dan pengingat',
      // MAX → heads-up di layar + bunyi, kecuali pengguna dulu membisukan channel lama.
      importance: await inheritedImportance(PushNotifications),
      visibility: 1, // tampil di layar kunci
      sound: CHANNEL_SOUND, // nama berkas di res/raw
      vibration: true,
      lights: true,
    });
    // Hapus SESUDAH channel baru ada, supaya tidak ada jeda tanpa channel.
    for (const id of LEGACY_CHANNEL_IDS) {
      await PushNotifications.deleteChannel({ id }).catch(() => {
        /* channel lama memang tidak ada / gagal dihapus → abaikan */
      });
    }
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

    // Channel prioritas tinggi bernada khas, dibuat SEBELUM register agar sudah
    // ada saat push pertama tiba (termasuk ketika app sedang tertutup).
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
    // (dulu memicu notif GANDA di status bar). Lonceng & halaman Notifikasi
    // diminta mengambil ulang agar badge dan daftar langsung bertambah.
    PushNotifications.addListener('pushNotificationReceived', (notif) => {
      showAppNotice({
        title: notif.title ?? 'Pemberitahuan',
        body: notif.body ?? undefined,
        link: (notif.data?.link as string | undefined) ?? undefined,
        tone: 'info',
      });
      requestFeedRefresh();
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
