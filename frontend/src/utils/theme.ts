import { useSyncExternalStore } from 'react';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { isEmbedMode } from './embed';

/**
 * Tema tampilan. Preferensi tersimpan di localStorage (`theme`) dan bawaannya
 * mengikuti sistem. Warna berasal dari token di globals.css: tema hanya menyetel
 * `data-theme` pada <html>, komponen tidak perlu tahu tema yang sedang aktif.
 *
 * Skrip inline di index.html menjalankan logika yang sama sebelum render agar tidak
 * ada kilatan terang. Bila aturan di sini berubah, ubah juga skrip itu.
 */
export type ThemePreference = 'system' | 'light' | 'dark';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'theme';

/** Sama dengan --color-panel tiap tema. */
const THEME_COLOR: Record<ResolvedTheme, string> = { light: '#FFFFFF', dark: '#1a2023' };

function isPreference(value: unknown): value is ThemePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

/**
 * Survei yang disematkan di situs resmi selalu terang. isEmbedMode bernilai false
 * bila sessionStorage diblokir (umum di iframe lintas situs), jadi parameter URL dan
 * keberadaan iframe ikut diperiksa di sini.
 */
export function isThemeLocked(): boolean {
  if (isEmbedMode) return true;
  try {
    const embed = new URLSearchParams(window.location.search).get('embed');
    return embed === '1' || embed === 'true' || window.self !== window.top;
  } catch {
    // Akses ke window.top ditolak berarti halaman ini ada di dalam iframe.
    return true;
  }
}

/** Preferensi tersimpan; 'system' bila kosong, tidak dikenal, atau storage diblokir. */
export function readThemePreference(): ThemePreference {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isPreference(stored) ? stored : 'system';
  } catch {
    return 'system';
  }
}

function saveThemePreference(preference: ThemePreference): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, preference);
  } catch {
    // Storage diblokir: pilihan tetap berlaku sampai halaman dimuat ulang.
  }
}

function systemMediaQuery(): MediaQueryList | null {
  try {
    return window.matchMedia?.('(prefers-color-scheme: dark)') ?? null;
  } catch {
    return null;
  }
}

/** Mengubah preferensi menjadi tema nyata. Mode embed selalu terang. */
export function resolveTheme(preference: ThemePreference): ResolvedTheme {
  if (isThemeLocked()) return 'light';
  if (preference === 'system') return systemMediaQuery()?.matches ? 'dark' : 'light';
  return preference;
}

interface PopuliThemePlugin {
  setAppearance(options: { dark: boolean; followSystem: boolean }): Promise<void>;
}

let nativeTheme: PopuliThemePlugin | null = null;

/**
 * Titik sambung native: menyelaraskan status bar, navigation bar, dan latar jendela dengan
 * tema (android/.../PopuliThemePlugin.java). No-op di web. Plugin SystemBars tidak dipakai di
 * sini karena ia mengembalikan latar jendela ke warna tema setiap kali dipanggil.
 */
export function syncNativeBars(resolved: ResolvedTheme): void {
  if (!Capacitor.isNativePlatform()) return;
  nativeTheme ??= registerPlugin<PopuliThemePlugin>('PopuliTheme');
  nativeTheme
    .setAppearance({
      dark: resolved === 'dark',
      followSystem: readThemePreference() === 'system',
    })
    .catch(() => {
      // Warna bar bukan hal yang boleh mengganggu halaman.
    });
}

/** Memasang tema ke dokumen. */
export function applyTheme(resolved: ResolvedTheme): void {
  const root = document.documentElement;
  root.dataset.theme = resolved;
  root.style.colorScheme = resolved;
  document
    .querySelector('meta[name="theme-color"]')
    ?.setAttribute('content', THEME_COLOR[resolved]);
  syncNativeBars(resolved);
}

interface ThemeSnapshot {
  preference: ThemePreference;
  resolved: ResolvedTheme;
}

function computeSnapshot(preference: ThemePreference): ThemeSnapshot {
  return { preference, resolved: resolveTheme(preference) };
}

let snapshot = computeSnapshot(readThemePreference());
const subscribers = new Set<() => void>();

function publish(preference: ThemePreference): void {
  snapshot = computeSnapshot(preference);
  applyTheme(snapshot.resolved);
  subscribers.forEach((notify) => notify());
}

/** Mengganti dan menyimpan preferensi, lalu langsung menerapkannya. */
export function setThemePreference(preference: ThemePreference): void {
  saveThemePreference(preference);
  publish(preference);
}

let listening = false;

/** Dipanggil sekali dari main.tsx: pasang tema dan dengarkan perubahan dari luar. */
export function initTheme(): void {
  publish(readThemePreference());
  if (listening) return;
  listening = true;
  systemMediaQuery()?.addEventListener?.('change', () => {
    if (snapshot.preference === 'system') publish('system');
  });
  // Pilihan yang diganti di tab lain ikut berlaku di tab ini.
  window.addEventListener('storage', (e) => {
    if (e.key === STORAGE_KEY) publish(readThemePreference());
  });
}

function subscribe(notify: () => void): () => void {
  subscribers.add(notify);
  return () => subscribers.delete(notify);
}

function getSnapshot(): ThemeSnapshot {
  return snapshot;
}

/** Tema untuk UI. `locked` berarti mode embed: pilihan tema tidak berlaku. */
export function useTheme() {
  const { preference, resolved } = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return { preference, resolved, setPreference: setThemePreference, locked: isThemeLocked() };
}
