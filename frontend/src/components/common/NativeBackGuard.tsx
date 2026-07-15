/**
 * Perilaku tombol Back Android per-rute (hanya app native, no-op di web):
 *   - /login                → langsung KELUAR aplikasi (tidak mundur ke splash).
 *   - /surveys & /admin/dashboard → beranda per peran: pop-up konfirmasi dulu; "Ya"
 *     = keluar aplikasi (sesi login TETAP tersimpan — buka lagi tanpa login).
 *   - Rute lain             → navigasi mundur normal (fallback: keluar).
 *
 * Mount SEKALI di tiap layout (Auth/Respondent/Admin) — hanya satu layout hidup
 * pada satu waktu. Detail koordinasi listener: utils/nativeBackButton.ts.
 */
import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { useConfirm } from '@/components/common/ConfirmDialog';
import { setDefaultBackHandler, exitNativeApp } from '@/utils/nativeBackButton';

/** Beranda per peran — Back di sini memunculkan konfirmasi keluar. */
const HOME_PATHS = new Set(['/surveys', '/admin/dashboard']);

export function NativeBackGuard() {
  const location = useLocation();
  const { confirm, dialog } = useConfirm();

  // Ref agar handler (terpasang sekali) selalu membaca path & confirm terkini
  // tanpa melepas-pasang default handler tiap navigasi.
  const pathRef = useRef(location.pathname);
  pathRef.current = location.pathname;
  const confirmRef = useRef(confirm);
  confirmRef.current = confirm;
  // Cegah dialog konfirmasi menumpuk bila Back ditekan berulang.
  const confirmOpenRef = useRef(false);

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    return setDefaultBackHandler((canGoBack) => {
      const path = pathRef.current;

      if (path === '/login') {
        void exitNativeApp();
        return;
      }

      if (HOME_PATHS.has(path)) {
        if (confirmOpenRef.current) return;
        confirmOpenRef.current = true;
        void confirmRef
          .current({
            title: 'Keluar Aplikasi?',
            message: 'Anda akan menutup aplikasi. Sesi Anda tetap tersimpan.',
            confirmText: 'Ya, keluar',
            cancelText: 'Batal',
          })
          .then((ok) => {
            if (ok) void exitNativeApp();
          })
          .finally(() => {
            confirmOpenRef.current = false;
          });
        return;
      }

      if (canGoBack) window.history.back();
      else void exitNativeApp();
    });
  }, []);

  return <>{dialog}</>;
}
