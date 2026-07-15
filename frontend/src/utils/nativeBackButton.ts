/**
 * Koordinator TUNGGAL tombol Back Android (Capacitor).
 *
 * Kenapa perlu: di Capacitor SEMUA listener 'backButton' ikut terpanggil dan
 * kehadiran satu listener saja mematikan perilaku default WebView. Bila tiap
 * halaman/modal memasang App.addListener sendiri bersamaan dengan handler
 * global, satu tekanan Back bisa memicu dua aksi sekaligus (mis. modal tertutup
 * DAN navigasi mundur). Maka: satu listener global di sini, halaman/modal cukup
 * mendaftar "override" ke stack — hanya override TERATAS yang dijalankan.
 *
 * Pemakaian:
 *   - Modal/sub-layar: useEffect(() => pushBackButtonOverride(onClose), [onClose])
 *     (fungsi kembaliannya adalah cleanup — cocok langsung untuk useEffect).
 *   - Perilaku default per-rute (keluar app di login, konfirmasi di beranda):
 *     setDefaultBackHandler(...) — dipakai NativeBackGuard.
 */
import { Capacitor } from '@capacitor/core';

type OverrideHandler = () => void;
type DefaultHandler = (canGoBack: boolean) => void;

const overrides: OverrideHandler[] = [];
let defaultHandler: DefaultHandler | null = null;
let listenerRegistered = false;

/** Pasang listener global sekali saja (no-op di web). */
export function initNativeBackButton(): void {
  if (!Capacitor.isNativePlatform() || listenerRegistered) return;
  listenerRegistered = true;
  void import('@capacitor/app').then(({ App }) => {
    void App.addListener('backButton', ({ canGoBack }) => {
      const top = overrides[overrides.length - 1];
      if (top) {
        top();
        return;
      }
      if (defaultHandler) {
        defaultHandler(canGoBack);
        return;
      }
      // Replika perilaku bawaan Capacitor bila tak ada handler terdaftar.
      if (canGoBack) window.history.back();
      else void App.exitApp();
    });
  });
}

/**
 * Daftarkan handler Back sementara (modal/sub-layar terbuka). Mengembalikan
 * fungsi pelepas — panggil saat modal tertutup/unmount.
 */
export function pushBackButtonOverride(handler: OverrideHandler): () => void {
  initNativeBackButton();
  overrides.push(handler);
  return () => {
    const i = overrides.lastIndexOf(handler);
    if (i >= 0) overrides.splice(i, 1);
  };
}

/** Set perilaku default per-rute (dipakai NativeBackGuard). Return: pelepas. */
export function setDefaultBackHandler(handler: DefaultHandler): () => void {
  initNativeBackButton();
  defaultHandler = handler;
  return () => {
    if (defaultHandler === handler) defaultHandler = null;
  };
}

/** Tutup (minimize/exit) aplikasi native. */
export async function exitNativeApp(): Promise<void> {
  const { App } = await import('@capacitor/app');
  await App.exitApp();
}
