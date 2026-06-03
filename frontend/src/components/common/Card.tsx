import type { HTMLAttributes, ReactNode } from 'react';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Removes the default inner padding (useful when wrapping tables). */
  flush?: boolean;
}

/**
 * Surface container used across the app. Favors a hairline border + soft
 * shadow over the heavy `shadow-md` look, which reads as more designed and
 * less like a default template.
 */
export function Card({ flush = false, className = '', children, ...props }: CardProps) {
  return (
    <div
      className={`rounded-xl border border-gray-200/80 bg-white shadow-[0_1px_2px_rgba(15,13,12,0.04),0_1px_3px_rgba(15,13,12,0.06)] ${
        flush ? '' : 'p-5 sm:p-6'
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

interface CardHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}

export function CardHeader({ title, description, action, className = '' }: CardHeaderProps) {
  return (
    <div className={`mb-4 flex items-start justify-between gap-4 ${className}`}>
      <div className="min-w-0">
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        {description && <p className="mt-0.5 text-sm text-gray-500">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
