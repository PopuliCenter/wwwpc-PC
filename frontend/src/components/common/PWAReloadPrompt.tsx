import { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

// Seberapa sering tab yang terbuka mengecek versi baru (deploy terbaru).
const UPDATE_CHECK_MS = 60 * 1000;

// Apakah halaman sudah dikontrol service worker saat dimuat. Jika ya,
// 'controllerchange' berikutnya berarti UPDATE (bukan instalasi pertama) →
// aman untuk memuat ulang. Mencegah reload yang tidak perlu pada kunjungan
// pertama saat SW baru pertama kali mengambil alih.
const hadController =
  typeof navigator !== 'undefined' &&
  'serviceWorker' in navigator &&
  !!navigator.serviceWorker.controller;

/**
 * Auto-update PWA (mode 'autoUpdate'): service worker baru langsung aktif, jadi
 * refresh biasa sudah menampilkan versi terbaru. Komponen ini juga mengecek versi
 * baru secara berkala dan memuat ulang tab yang terbuka begitu SW baru aktif —
 * KECUALI saat responden sedang mengisi survei (agar jawaban tidak terganggu;
 * versi baru tetap tampil begitu pindah halaman / refresh).
 */
export function PWAReloadPrompt() {
  useRegisterSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      setInterval(() => {
        registration.update().catch(() => {
          /* offline / gagal cek — abaikan, coba lagi nanti */
        });
      }, UPDATE_CHECK_MS);
    },
  });

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    let reloaded = false;
    const onControllerChange = () => {
      if (reloaded || !hadController) return;
      // Jangan ganggu pengisian survei yang sedang berjalan.
      if (/\/surveys\/[^/]+\/fill/.test(window.location.pathname)) return;
      reloaded = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    return () =>
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
  }, []);

  return null;
}
