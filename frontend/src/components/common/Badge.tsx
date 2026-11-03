import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

export type BadgeTone =
  'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'active' | 'muted';

// Status berupa teks berwarna, bukan pil: tanpa latar, ring, border, atau rounded-full.
// brand & info tidak punya arti sendiri, jadi jatuh ke neutral.
const tones: Record<BadgeTone, string> = {
  neutral: 'text-gray-600',
  brand: 'text-gray-600',
  info: 'text-gray-600',
  success: 'text-success-fg',
  warning: 'text-warning-fg',
  danger: 'text-danger-fg',
  active: 'text-gray-900',
  muted: 'text-gray-500',
};

interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
  /** Penanda kotak kecil di depan teks. Tone `active` selalu memilikinya. */
  dot?: boolean;
  /** Ikon lucide di depan teks (h-3.5). Menggantikan penanda kotak bila keduanya diisi. */
  icon?: LucideIcon;
  /** Penjelasan status saat kursor di atasnya. */
  title?: string;
}

/**
 * Label status: ikon atau kotak kecil + teks.
 * - active: teks gray-900 + kotak hijau (survei/akun aktif)
 * - neutral + dot: nonaktif; muted: diarsipkan (tanpa penanda)
 * - success / warning / danger: warna membawa arti, teks wajib menyebutkannya
 */
export function Badge({
  children,
  tone = 'neutral',
  className = '',
  dot = false,
  icon: Icon,
  title,
}: BadgeProps) {
  const showMarker = !Icon && (dot || tone === 'active');
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1.5 text-xs font-medium ${tones[tone]} ${className}`}
    >
      {Icon && <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} aria-hidden="true" />}
      {showMarker && (
        <span
          className={`h-1.5 w-1.5 shrink-0 bg-current ${tone === 'active' ? 'text-success-fg' : ''}`}
          aria-hidden="true"
        />
      )}
      {children}
    </span>
  );
}
