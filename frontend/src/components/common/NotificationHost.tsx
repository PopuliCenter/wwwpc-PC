import { useEffect } from 'react';
import { Bell, CheckCircle2, AlertTriangle, XCircle, X } from 'lucide-react';
import { router } from '@/router';
import { useNotificationStore, type AppNotice } from '@/stores/notification.store';

const toneStyles: Record<
  NonNullable<AppNotice['tone']>,
  { ring: string; icon: typeof Bell; iconCls: string }
> = {
  info: { ring: 'border-indigo-200', icon: Bell, iconCls: 'text-indigo-600' },
  success: { ring: 'border-emerald-200', icon: CheckCircle2, iconCls: 'text-emerald-600' },
  warning: { ring: 'border-amber-200', icon: AlertTriangle, iconCls: 'text-amber-600' },
  error: { ring: 'border-red-200', icon: XCircle, iconCls: 'text-red-600' },
};

function NoticeCard({ notice }: { notice: AppNotice }) {
  const dismiss = useNotificationStore((s) => s.dismiss);
  const tone = toneStyles[notice.tone ?? 'info'];
  const Icon = tone.icon;

  // Auto-tutup setelah durationMs (0 = tidak).
  useEffect(() => {
    if (!notice.durationMs) return;
    const t = window.setTimeout(() => dismiss(notice.id), notice.durationMs);
    return () => window.clearTimeout(t);
  }, [notice.id, notice.durationMs, dismiss]);

  const clickable = Boolean(notice.link);
  const open = () => {
    if (notice.link) router.navigate(notice.link);
    dismiss(notice.id);
  };

  return (
    <div
      className={`pointer-events-auto w-full max-w-sm rounded-xl border ${tone.ring} bg-white shadow-lg ring-1 ring-black/5`}
      role="status"
    >
      <div className="flex items-start gap-3 p-3">
        <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${tone.iconCls}`} />
        <button
          type="button"
          onClick={clickable ? open : undefined}
          className={`min-w-0 flex-1 text-left ${clickable ? 'cursor-pointer' : 'cursor-default'}`}
        >
          <p className="text-sm font-semibold text-gray-900">{notice.title}</p>
          {notice.body && <p className="mt-0.5 text-sm text-gray-600">{notice.body}</p>}
          {clickable && (
            <p className="mt-1 text-xs font-medium text-indigo-600">Ketuk untuk membuka →</p>
          )}
        </button>
        <button
          type="button"
          onClick={() => dismiss(notice.id)}
          className="shrink-0 rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          aria-label="Tutup"
        >
          <X className="h-4 w-4" />
        </button>
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
  if (notices.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex flex-col items-center gap-2 p-3 sm:items-end">
      {notices.map((n) => (
        <NoticeCard key={n.id} notice={n} />
      ))}
    </div>
  );
}
