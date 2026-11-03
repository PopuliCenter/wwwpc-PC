import { forwardRef, useCallback, type ButtonHTMLAttributes, type MouseEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { haptic } from '@/utils/haptics';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  isLoading?: boolean;
}

const base =
  'relative inline-flex items-center justify-center gap-2 rounded-lg font-medium ' +
  'transition-colors duration-150 disabled:opacity-50 disabled:pointer-events-none select-none';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800',
  secondary: 'bg-white text-gray-800 border border-gray-300 hover:bg-gray-50 active:bg-gray-100',
  ghost: 'bg-transparent text-gray-700 hover:bg-gray-100 active:bg-gray-200',
  danger: 'bg-danger-fg text-white hover:bg-danger-hover active:bg-danger-hover',
};

const sizes: Record<ButtonSize, string> = {
  // h-9 tampil 36px; ::before memperluas area ketuk jadi minimal 44px di HP tanpa
  // mengubah tampilan (desktop tidak memerlukannya). ::before dihitung dari padding
  // box: varian berborder 34 + 10 = 44px, varian tanpa border 36 + 10 = 46px.
  sm: 'h-9 px-3 text-sm before:absolute before:inset-x-0 before:-inset-y-[5px] lg:before:hidden',
  md: 'h-11 lg:h-10 px-4 text-sm',
  lg: 'h-12 lg:h-11 px-5 text-base',
};

/**
 * Kelas tombol yang sama dengan <Button>, untuk elemen bukan <button> (mis.
 * <Link> bergaya tombol). Pasangkan dengan useTapFeedback agar umpan baliknya sama.
 */
export function buttonCls(
  variant: ButtonVariant = 'primary',
  size: ButtonSize = 'md',
  className = '',
): string {
  return `${base} ${variants[variant]} ${sizes[size]} ${className}`;
}

/**
 * Umpan balik ketuk (satu sumber): getar halus (hanya di app) + riak dari titik
 * ketuk. Pasang pada onClick elemen apa pun; posisi elemen dijadikan relative bila
 * masih static dan riak dibungkus sendiri, jadi tidak butuh overflow-hidden.
 *
 *   const tap = useTapFeedback();
 *   <Link to="/x" className={buttonCls('secondary')} onClick={tap}>Buka</Link>
 *   <button onClick={(e) => { tap(e); lakukanSesuatu(); }}>…</button>
 */
export function useTapFeedback() {
  return useCallback((e: MouseEvent<HTMLElement>) => {
    void haptic('light');
    const el = e.currentTarget;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

    if (window.getComputedStyle(el).position === 'static') el.style.position = 'relative';
    const rect = el.getBoundingClientRect();
    const d = Math.max(rect.width, rect.height);
    // Klik dari keyboard tidak punya koordinat → riak dari tengah elemen.
    const fromPointer = e.clientX !== 0 || e.clientY !== 0;
    const x = fromPointer ? e.clientX - rect.left : rect.width / 2;
    const y = fromPointer ? e.clientY - rect.top : rect.height / 2;

    const clip = document.createElement('span');
    clip.setAttribute('aria-hidden', 'true');
    clip.style.cssText =
      'position:absolute;inset:0;overflow:hidden;border-radius:inherit;pointer-events:none;';
    const ripple = document.createElement('span');
    ripple.style.cssText = `position:absolute;left:${x - d / 2}px;top:${
      y - d / 2
    }px;width:${d}px;height:${d}px;border-radius:50%;background:currentColor;opacity:0.16;transform:scale(0);`;
    ripple.style.animation = 'ripple 0.45s ease-out forwards';
    clip.appendChild(ripple);
    el.appendChild(clip);
    window.setTimeout(() => clip.remove(), 500);
  }, []);
}

/**
 * Tombol utama aplikasi. `type` tidak diberi bawaan (mengikuti HTML): di dalam
 * <form> tombol tanpa type adalah submit, jadi tulis type="button" untuk aksi biasa.
 */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    children,
    variant = 'primary',
    size = 'md',
    isLoading = false,
    disabled,
    className = '',
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
      className={buttonCls(variant, size, className)}
      disabled={disabled || isLoading}
      onClick={handleClick}
      {...props}
    >
      {isLoading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
});
