import { useEffect, useState, useSyncExternalStore } from 'react';
import { Bell, CheckCircle2, AlertTriangle, XCircle, X } from 'lucide-react';
import { router } from '@/router';
import { useNotificationStore, type AppNotice } from '@/stores/notification.store';
import { isEmbedMode } from '@/utils/embed';
import { IconButton } from './IconButton';

const subscribeRoute = (onChange: () => void) => router.subscribe(() => onChange());
const isFillRoute = () => /^\/surveys\/[^/]+\/fill$/.test(router.state.location.pathname);

const toneStyles: Record<NonNullable<AppNotice['tone']>, { icon: typeof Bell; iconCls: string }> = {
  info: { icon: Bell, iconCls: 'text-gray-600' },
  success: { icon: CheckCircle2, iconCls: 'text-success-fg' },
  warning: { icon: AlertTriangle, iconCls: 'text-warning-fg' },
  error: { icon: XCircle, iconCls: 'text-danger-fg' },
};

function NoticeCard({ notice }: { notice: AppNotice }) {
  const dismiss = useNotificationStore((s) => s.dismiss);
  const tone = toneStyles[notice.tone ?? 'info'];
  const Icon = tone.icon;
  // Jeda auto-tutup selama kursor/fokus di atas kartu agar tak hilang sebelum
  // sempat diketuk (penting untuk notice ber-link "ketuk untuk membuka").
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (!notice.durationMs || paused) return;
    const t = window.setTimeout(() => dismiss(notice.id), notice.durationMs);
    return () => window.clearTimeout(t);
  }, [notice.id, notice.durationMs, dismiss, paused]);

  const clickable = Boolean(notice.link);
  const open = () => {
    if (notice.link) router.navigate(notice.link);
    dismiss(notice.id);
  };

  return (
    <div
      className="animate-toast-in pointer-events-auto w-full max-w-sm rounded-lg border border-gray-200 bg-panel text-sm text-gray-900 shadow-lg"
      role="status"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <div className="flex items-start gap-3 p-3">
        <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${tone.iconCls}`} strokeWidth={1.75} />
        <button
          type="button"
          onClick={clickable ? open : undefined}
          className={`min-w-0 flex-1 text-left ${clickable ? 'cursor-pointer' : 'cursor-default'}`}
        >
          <p className="font-medium text-gray-900">{notice.title}</p>
          {notice.body && <p className="mt-0.5 text-gray-600">{notice.body}</p>}
          {clickable && (
            <p className="mt-1 text-xs font-medium text-gray-600">Ketuk untuk membuka →</p>
          )}
        </button>
        <IconButton aria-label="Tutup" className="-my-2 -mr-2" onClick={() => dismiss(notice.id)}>
          <X className="h-4 w-4" strokeWidth={1.75} />
        </IconButton>
      </div>
    </div>
  );
}

/**
 * Wadah pop-up in-app — ditempatkan sekali di root aplikasi. Menampilkan
 * notifikasi dari `useNotificationStore` (mis. push foreground, info, error).
 */
export function NotificationHost() {
  const notices = useNotificationStore((s) => s.notices);
  const fillMode = useSyncExternalStore(subscribeRoute, isFillRoute);
  if (notices.length === 0) return null;

  // Saat mengisi survei, toast turun ke bawah strip progres (header 64px + strip 39px)
  // agar timer tetap terbaca, termasuk saat toast "Waktu hampir habis" muncul.
  const top = !fillMode ? 'top-0' : isEmbedMode ? 'top-7' : 'top-[92px]';

  return (
    <div
      className={`pointer-events-none fixed inset-x-0 z-[60] flex flex-col items-center gap-2 p-3 sm:items-end ${top}`}
    >
      {notices.map((n) => (
        <NoticeCard key={n.id} notice={n} />
      ))}
    </div>
  );
}
