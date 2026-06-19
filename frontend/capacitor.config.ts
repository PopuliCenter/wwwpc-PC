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
  appName: 'Survei Populi',
  webDir: 'dist',
  server: {
    // Skema https untuk Android agar service worker / API sama seperti web.
    androidScheme: 'https',
  },
  plugins: {
    PushNotifications: {
      // Saat aplikasi DI DEPAN (foreground), tampilkan juga banner sistem.
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;
