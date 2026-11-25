import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Download, RefreshCw } from 'lucide-react';
import { Button } from '@/components/common/Button';
import {
  type AppVersionInfo,
  type UpdateStatus,
  evaluateUpdate,
  fetchAppVersion,
  getNativeVersionCode,
  isSnoozed,
  loadCachedInfo,
  nativeUpdatePlatform,
  openDownloadUrl,
  snoozeUpdate,
} from '@/services/appUpdate';

/** Jarak minimum antar-pengecekan ke server saat app kembali ke depan. */
const RECHECK_MS = 15 * 60 * 1000;

/** Jangan sela pengisian survei atau halaman update dengan tawaran opsional. */
function optionalPromptBlocked(): boolean {
  const path = window.location.pathname;
  return /\/surveys\/[^/]+\/fill/.test(path) || path === '/app-update';
}

interface GateState {
  status: UpdateStatus;
  info: AppVersionInfo;
}

/**
 * Pengecek versi app Android, dipasang sekali di App.tsx (di luar router).
 *
 * - Saat app dibuka & kembali ke depan: bandingkan versionCode dengan rilis
 *   terbaru dari GET /app/version (maks. sekali per 15 menit ke server).
 * - Versi di bawah minimum (rilis "wajib update") → layar penuh yang tidak bisa
 *   ditutup; tetap tampil saat offline berkat info terakhir yang di-cache.
 * - Ada versi lebih baru → dialog "Perbarui / Nanti" (Nanti = tunda 24 jam).
 * Di web tidak melakukan apa-apa.
 */
export function AppUpdateGate() {
  const [state, setState] = useState<GateState | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const lastFetchRef = useRef(0);
  const titleId = useId();

  const evaluate = useCallback(async (info: AppVersionInfo | null) => {
    if (!info) return;
    const code = await getNativeVersionCode();
    const status = evaluateUpdate(code, info);
    if (status === 'none') {
      setState(null);
      return;
    }
    if (status === 'optional' && (isSnoozed(info.latestVersionCode) || optionalPromptBlocked())) {
      setState(null);
      return;
    }
    setDismissed(false);
    setState({ status, info });
  }, []);

  const check = useCallback(
    async (force = false) => {
      const platform = nativeUpdatePlatform();
      if (!platform) return;
      if (!force && Date.now() - lastFetchRef.current < RECHECK_MS) return;
      lastFetchRef.current = Date.now();
      try {
        await evaluate(await fetchAppVersion(platform));
      } catch {
        // Offline / server tak terjangkau → pakai info terakhir (tetap memblokir
        // bila versi ini sudah di bawah minimum).
        await evaluate(loadCachedInfo());
      }
    },
    [evaluate],
  );

  useEffect(() => {
    if (!nativeUpdatePlatform()) return;
    void evaluate(loadCachedInfo());
    void check(true);

    let remove: (() => void) | undefined;
    let cancelled = false;
    void import('@capacitor/app')
      .then(({ App }) =>
        App.addListener('resume', () => {
          void check();
        }),
      )
      .then((handle) => {
        if (cancelled) void handle.remove();
        else remove = () => void handle.remove();
      })
      .catch(() => {
        /* plugin App tak tersedia → cukup cek saat dibuka */
      });
    return () => {
      cancelled = true;
      remove?.();
    };
  }, [check, evaluate]);

  if (!state || (state.status === 'optional' && dismissed)) return null;

  const { info, status } = state;
  const required = status === 'required';
  const versionLabel = info.latestVersionName ? `versi ${info.latestVersionName}` : 'versi terbaru';

  const later = () => {
    if (info.latestVersionCode !== null) snoozeUpdate(info.latestVersionCode);
    setDismissed(true);
  };

  return createPortal(
    <div
      className={`fixed inset-0 z-[80] flex justify-center p-4 ${
        required ? 'items-center bg-paper' : 'items-end bg-black/50 sm:items-center'
      }`}
    >
      <div
        className="w-full max-w-sm rounded-xl bg-panel p-5 text-left shadow-xl"
        role={required ? 'alertdialog' : 'dialog'}
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="flex items-start gap-2">
          <RefreshCw
            className="mt-1 h-[18px] w-[18px] shrink-0 text-primary-600"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <h2 id={titleId} className="min-w-0 text-lg font-semibold text-gray-900">
            {required ? 'Perbarui aplikasi untuk melanjutkan' : 'Versi baru tersedia'}
          </h2>
        </div>
        <p className="mt-2 text-sm text-gray-600">
          {required
            ? `Versi aplikasi Anda sudah tidak didukung. Pasang ${versionLabel} agar bisa mengisi survei dan menukar poin. Data Anda tetap aman.`
            : `Aplikasi Populi ${versionLabel} sudah tersedia dengan perbaikan terbaru.`}
        </p>
        {info.releaseNotes && (
          <p className="mt-3 max-h-40 overflow-y-auto whitespace-pre-line rounded-lg border border-gray-200 bg-paper p-3 text-sm text-gray-700">
            {info.releaseNotes}
          </p>
        )}
        <div className="mt-5 flex justify-end gap-2">
          {!required && (
            <Button type="button" variant="secondary" onClick={later}>
              Nanti
            </Button>
          )}
          <Button
            type="button"
            autoFocus
            disabled={!info.downloadUrl}
            onClick={() => openDownloadUrl(info.downloadUrl)}
          >
            <Download className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            Perbarui sekarang
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
