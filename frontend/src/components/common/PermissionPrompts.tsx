import { useCallback, useEffect, useRef, useState } from 'react';
import { Bell, MapPin, RefreshCw, X, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { IconButton } from '@/components/common/IconButton';
import {
  APP_VERSION_EVENT,
  evaluateUpdate,
  getNativeVersionCode,
  loadCachedInfo,
  openDownloadUrl,
} from '@/services/appUpdate';
import {
  PERMISSION_SNOOZE_MS,
  UPDATE_SNOOZE_MS,
  dismissPrompt,
  enableLocation,
  enableNotifications,
  isAndroidApp,
  isPromptDismissed,
  locationState,
  notificationsOff,
} from '@/services/devicePermissions';

interface Prompt {
  /** Kunci tunda ("×"); kartu versi baru per versi. */
  key: string;
  snoozeMs: number;
  icon: LucideIcon;
  title: string;
  body: string;
  actionLabel: string;
  action: () => Promise<void> | void;
}

/**
 * Kandidat kartu, urut prioritas. Hanya SATU kartu tampil agar beranda tidak penuh;
 * setelah satu beres/ditunda, kartu berikutnya muncul.
 */
async function nextPrompt(): Promise<Prompt | null> {
  const info = loadCachedInfo();
  const code = await getNativeVersionCode();
  if (evaluateUpdate(code, info) === 'optional' && info?.latestVersionCode) {
    const key = `update:${info.latestVersionCode}`;
    if (!isPromptDismissed(key)) {
      return {
        key,
        snoozeMs: UPDATE_SNOOZE_MS,
        icon: RefreshCw,
        title: `Versi baru ${info.latestVersionName ?? ''} tersedia`.replace(/\s+/g, ' '),
        body: 'Perbarui aplikasi untuk mendapat perbaikan terbaru.',
        actionLabel: 'Perbarui',
        action: () => {
          openDownloadUrl(info.downloadUrl);
        },
      };
    }
  }

  if (!isPromptDismissed('notifications') && (await notificationsOff())) {
    return {
      key: 'notifications',
      snoozeMs: PERMISSION_SNOOZE_MS,
      icon: Bell,
      title: 'Nyalakan notifikasi',
      body: 'Biar tahu saat ada survei baru, pengingat, dan poin masuk.',
      actionLabel: 'Aktifkan',
      action: enableNotifications,
    };
  }

  if (!isPromptDismissed('location')) {
    const state = await locationState();
    if (state !== 'ok') {
      return {
        key: 'location',
        snoozeMs: PERMISSION_SNOOZE_MS,
        icon: MapPin,
        title: state === 'service-off' ? 'Nyalakan lokasi (GPS)' : 'Izinkan akses lokasi',
        body:
          state === 'service-off'
            ? 'Lokasi HP sedang mati. Beberapa survei membutuhkan lokasi aktif.'
            : 'Beberapa survei membutuhkan lokasi Anda saat mengisi.',
        actionLabel: state === 'service-off' ? 'Nyalakan' : 'Izinkan',
        action: () => enableLocation(state),
      };
    }
  }
  return null;
}

/**
 * Kartu ajakan di beranda responden (app Android): versi baru tersedia, notifikasi
 * mati, izin lokasi / GPS mati. "×" menunda kartu (7 hari; versi baru 3 hari per
 * versi). Status dicek ulang saat app kembali ke depan — mis. setelah pengguna
 * menyalakan sesuatu di Setelan HP. Di web tidak tampil.
 */
export function PermissionPrompts() {
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  const [busy, setBusy] = useState(false);
  const runRef = useRef(0);

  const refresh = useCallback(async () => {
    const run = ++runRef.current;
    const next = await nextPrompt().catch(() => null);
    if (run === runRef.current) setPrompt(next);
  }, []);

  useEffect(() => {
    if (!isAndroidApp()) return;
    void refresh();
    const onVersion = () => void refresh();
    window.addEventListener(APP_VERSION_EVENT, onVersion);

    let remove: (() => void) | undefined;
    let cancelled = false;
    void import('@capacitor/app')
      .then(({ App }) => App.addListener('resume', () => void refresh()))
      .then((handle) => {
        if (cancelled) void handle.remove();
        else remove = () => void handle.remove();
      })
      .catch(() => {
        /* tanpa plugin App: cukup dicek saat beranda dibuka */
      });
    return () => {
      cancelled = true;
      window.removeEventListener(APP_VERSION_EVENT, onVersion);
      remove?.();
    };
  }, [refresh]);

  if (!prompt) return null;
  const Icon = prompt.icon;

  const act = async () => {
    setBusy(true);
    try {
      await prompt.action();
    } finally {
      setBusy(false);
      // Dialog izin di dalam app langsung selesai; yang lewat Setelan dicek saat resume.
      void refresh();
    }
  };

  const dismiss = () => {
    dismissPrompt(prompt.key, prompt.snoozeMs);
    void refresh();
  };

  return (
    <div
      role="region"
      aria-label={prompt.title}
      className="mb-5 flex items-center gap-3 rounded-xl border border-gray-200 bg-panel p-3 sm:p-4"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-600">
        <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-gray-900">{prompt.title}</p>
        <p className="text-sm text-gray-600">{prompt.body}</p>
      </div>
      <Button type="button" size="sm" disabled={busy} onClick={() => void act()}>
        {prompt.actionLabel}
      </Button>
      <IconButton aria-label="Tutup, ingatkan nanti" onClick={dismiss} className="-mr-1">
        <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
      </IconButton>
    </div>
  );
}
