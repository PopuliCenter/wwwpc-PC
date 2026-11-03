import type { HTMLAttributes, ReactNode } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, type LucideIcon } from 'lucide-react';

export type NoticeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const tones: Record<NoticeTone, { box: string; icon: string; defaultIcon: LucideIcon | null }> = {
  neutral: {
    box: 'border-gray-200 bg-gray-50 text-gray-700',
    icon: 'text-gray-600',
    defaultIcon: null,
  },
  info: {
    box: 'border-info-border bg-info-bg text-gray-800',
    icon: 'text-info-fg',
    defaultIcon: Info,
  },
  success: {
    box: 'border-success-border bg-success-bg text-gray-800',
    icon: 'text-success-fg',
    defaultIcon: CheckCircle2,
  },
  warning: {
    box: 'border-warning-border bg-warning-bg text-gray-800',
    icon: 'text-warning-fg',
    defaultIcon: AlertTriangle,
  },
  danger: {
    box: 'border-danger-border bg-danger-bg text-gray-800',
    icon: 'text-danger-fg',
    defaultIcon: AlertCircle,
  },
};

interface NoticeProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  tone?: NoticeTone;
  /** Judul tebal opsional di atas isi. */
  title?: ReactNode;
  /** Ganti ikon bawaan; `null` menghilangkan ikon. Tone neutral bawaannya tanpa ikon. */
  icon?: LucideIcon | null;
  /** Aksi di bawah isi (mis. <Button size="sm">). */
  action?: ReactNode;
}

/**
 * Pesan yang menghalangi atau butuh tindakan, dan kotak info biasa (tone neutral).
 * Tanpa garis warna di tepi kiri atau atas. Untuk pesan error yang muncul setelah
 * aksi, tambahkan role="alert".
 */
export function Notice({
  tone = 'neutral',
  title,
  icon,
  action,
  className = '',
  children,
  ...props
}: NoticeProps) {
  const style = tones[tone];
  const Icon = icon === undefined ? style.defaultIcon : icon;
  return (
    <div
      className={`flex gap-2.5 rounded-lg border p-3 text-sm ${style.box} ${className}`}
      {...props}
    >
      {Icon && (
        <Icon
          className={`mt-0.5 h-4 w-4 shrink-0 ${style.icon}`}
          strokeWidth={1.75}
          aria-hidden="true"
        />
      )}
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium text-gray-900">{title}</p>}
        {children && <div className={title ? 'mt-0.5' : ''}>{children}</div>}
        {action && <div className="mt-2">{action}</div>}
      </div>
    </div>
  );
}
