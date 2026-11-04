import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Konfigurasi Capacitor — membungkus build web (Vite → `dist`) menjadi aplikasi
 * native Android/iOS tanpa menulis ulang UI.
 *
 * Alur build native (lihat docs/capacitor-runbook.md):
 *   npm run build            # hasilkan dist/
 *   npx cap sync             # salin web + plugin ke proyek native
 *   npx cap open android     # buka di Android Studio untuk build APK
 */
const config: CapacitorConfig = {
  appId: 'com.populicenter.survei',
  appName: 'Riset Populi Center',
  webDir: 'dist',
  // backgroundColor sengaja tidak diset. Nilainya statis, jadi warna apa pun akan berkilat di
  // salah satu tema. PopuliThemePlugin menyetel latar WebView sesuai tema sebelum frame pertama.
  server: {
    // Skema https untuk Android agar service worker / API sama seperti web.
    androidScheme: 'https',
  },
  plugins: {
    // Plugin bawaan @capacitor/core 8. DEFAULT mengikuti mode gelap HP, senada dengan tema
    // DayNight. Pilihan Gelap atau Terang di aplikasi diterapkan PopuliThemePlugin sesudahnya.
    SystemBars: {
      style: 'DEFAULT',
    },
    PushNotifications: {
      // Saat aplikasi DI DEPAN (foreground), tampilkan juga banner sistem.
      presentationOptions: ['badge', 'sound', 'alert'],
    },
    // @capgo/capacitor-social-login: app HANYA memakai login Google. Nonaktifkan
    // Facebook agar SDK-nya tidak ikut membundel izin iklan AD_ID / ACCESS_ADSERVICES_*
    // (Facebook SDK yg menariknya) — izin itu memicu kewajiban deklarasi "advertising
    // ID" di Play Console yg tidak sesuai (app survei ini tanpa iklan/tracking).
    // apple & twitter dibiarkan aktif (apple menjaga androidx.browser utk Custom Tabs;
    // twitter tanpa SDK jadi tak menambah izin). Hook cap sync menulis ulang
    // gradle.properties plugin dari config ini.
    SocialLogin: {
      providers: {
        facebook: false,
      },
    },
  },
};

export default config;
