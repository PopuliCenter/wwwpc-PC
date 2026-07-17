import type { ButtonHTMLAttributes, MouseEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { haptic } from '@/utils/haptics';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  isLoading?: boolean;
}

const base =
  'relative overflow-hidden inline-flex items-center justify-center gap-2 rounded-lg font-medium ' +
  'transition-[background-color,box-shadow,transform] duration-150 active:scale-[0.98] ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 ' +
  'disabled:opacity-50 disabled:pointer-events-none select-none';

const variants: Record<Variant, string> = {
  primary:
    'bg-primary-600 text-white shadow-sm hover:bg-primary-700 ' +
    'focus-visible:ring-primary-500 ring-offset-white',
  secondary:
    'bg-white text-gray-800 border border-gray-300 shadow-sm hover:bg-gray-50 ' +
    'hover:border-gray-400 focus-visible:ring-primary-500 ring-offset-white',
  ghost:
    'bg-transparent text-gray-600 hover:bg-gray-100 hover:text-gray-900 ' +
    'focus-visible:ring-primary-500 ring-offset-white',
  danger:
    'bg-red-600 text-white shadow-sm hover:bg-red-700 ' +
    'focus-visible:ring-red-500 ring-offset-white',
};

const sizes: Record<Size, string> = {
  sm: 'h-8 px-3 text-sm',
  md: 'h-10 px-4 text-sm',
  lg: 'h-11 px-5 text-base',
};

export function Button({
  children,
  variant = 'primary',
  size = 'md',
  isLoading = false,
  disabled,
  className = '',
  onClick,
  ...props
}: ButtonProps) {
  const handleClick = (e: MouseEvent<HTMLButtonElement>) => {
    // Umpan balik native-feel: getar halus (hanya di app) + riak dari titik ketuk.
    void haptic('light');
    const btn = e.currentTarget;
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (!reduce) {
      const rect = btn.getBoundingClientRect();
      const d = Math.max(rect.width, rect.height);
      const ripple = document.createElement('span');
      ripple.style.cssText = `position:absolute;left:${e.clientX - rect.left - d / 2}px;top:${
        e.clientY - rect.top - d / 2
      }px;width:${d}px;height:${d}px;border-radius:50%;background:currentColor;opacity:0.28;transform:scale(0);pointer-events:none;`;
      ripple.style.animation = 'ripple 0.55s ease-out forwards';
      btn.appendChild(ripple);
      window.setTimeout(() => ripple.remove(), 600);
    }
    onClick?.(e);
  };

  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      disabled={disabled || isLoading}
      onClick={handleClick}
      {...props}
    >
      {isLoading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
  );
}
