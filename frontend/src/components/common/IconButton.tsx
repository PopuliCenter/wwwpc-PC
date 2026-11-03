import { forwardRef, type ButtonHTMLAttributes, type MouseEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { useTapFeedback } from './Button';

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  /** Wajib: tombol ikon tidak punya teks, jadi ini satu-satunya nama aksesibelnya. */
  'aria-label': string;
  /** Aksi merusak (hapus): hover menjadi merah. Warna bawaan tetap abu-abu. */
  destructive?: boolean;
  isLoading?: boolean;
}

/**
 * Kelas yang sama dengan <IconButton>, untuk elemen bukan <button> (mis. tautan
 * unduhan <a>). Pasangkan dengan useTapFeedback agar umpan baliknya sama.
 */
export function iconButtonCls(destructive = false, className = ''): string {
  return `relative inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-gray-600 transition-colors duration-150 before:absolute before:-inset-0.5 hover:bg-gray-100 active:bg-gray-200 disabled:pointer-events-none disabled:opacity-50 lg:h-9 lg:w-9 lg:before:hidden ${
    destructive ? 'hover:text-danger-fg' : 'hover:text-gray-900'
  } ${className}`;
}

/**
 * Tombol berisi satu ikon lucide (16-20px, strokeWidth 1.75), tanpa wadah berwarna.
 * Tampil 40px di HP (::before memperluas area ketuk jadi 44px) dan 36px di desktop.
 * `type` bawaan "button" karena tombol ikon hampir tidak pernah men-submit form.
 *
 *   <IconButton aria-label="Hapus" destructive onClick={hapus}>
 *     <Trash2 className="h-[18px] w-[18px]" strokeWidth={1.75} />
 *   </IconButton>
 */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  {
    children,
    destructive = false,
    isLoading = false,
    disabled,
    className = '',
    title,
    type = 'button',
    onClick,
    ...props
  },
  ref,
) {
  const tap = useTapFeedback();

  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    tap(e);
    onClick?.(e);
  };

  return (
    <button
      ref={ref}
      type={type}
      title={title ?? props['aria-label']}
      disabled={disabled || isLoading}
      onClick={handleClick}
      className={iconButtonCls(destructive, className)}
      {...props}
    >
      {isLoading ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : children}
    </button>
  );
});
