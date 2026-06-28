import { Capacitor } from '@capacitor/core';
import { getAppVersion } from '@/utils/appVersion';
import { useAuthStore } from '@/stores/auth.store';

// Sama dgn api.ts: web '/api' (proxy nginx), native pakai URL absolut.
const BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, '') ||
  '/api';

const deviceType = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)
  ? 'mobile'
  : 'desktop';

// Versi app di-resolve sekali (native: versionName; web: package.json).
let appVersion = '';
void getAppVersion()
  .then((v) => {
    appVersion = v;
  })
  .catch(() => {});

// Anti-banjir: dedupe pesan identik + batasi jumlah per sesi.
const seen = new Set<string>();
let sentCount = 0;
const MAX_PER_SESSION = 50;

export interface ReportInput {
  level?: 'error' | 'warn' | 'info';
  message: string;
  stack?: string;
  source?: string;
  context?: Record<string, unknown>;
}

/** Kirim laporan error ke backend (fire-and-forget). Tak pernah melempar. */
export function reportClientError(input: ReportInput): void {
  try {
    if (sentCount >= MAX_PER_SESSION) return;
    const key = `${input.level ?? 'error'}:${input.message}:${input.source ?? ''}`.slice(
      0,
      300,
    );
    if (seen.has(key)) return;
    seen.add(key);
    sentCount += 1;

    const user = useAuthStore.getState().user;
    const body = {
      level: input.level ?? 'error',
      message: String(input.message).slice(0, 2000),
      stack: input.stack?.slice(0, 8000),
      source: (
        input.source ??
        (typeof location !== 'undefined' ? location.pathname : '')
      ).slice(0, 500),
      platform: Capacitor.getPlatform(),
      deviceType,
      appVersion,
      userAgent: navigator.userAgent.slice(0, 500),
      userEmail: user?.email,
      context: input.context,
    };

    // Pakai fetch langsung (bukan api.ts) agar tak terpengaruh logika 401/redirect.
    void fetch(`${BASE_URL}/client-logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* monitoring tak boleh memunculkan error baru */
  }
}

/** Pasang penangkap error global (dipanggil sekali saat startup). */
export function initErrorMonitoring(): void {
  window.addEventListener('error', (e) => {
    reportClientError({
      message: e.message || 'Unhandled error',
      stack: (e.error as Error | undefined)?.stack,
      source: `${e.filename || location.pathname}${e.lineno ? `:${e.lineno}` : ''}`,
    });
  });
  window.addEventListener('unhandledrejection', (e) => {
    const reason = e.reason as { message?: string; stack?: string } | undefined;
    reportClientError({
      message: reason?.message
        ? `Unhandled rejection: ${reason.message}`
        : `Unhandled rejection: ${String(e.reason)}`,
      stack: reason?.stack,
    });
  });
}
