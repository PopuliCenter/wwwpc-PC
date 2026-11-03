import { Skeleton } from './Skeleton';

/** Fallback ringan saat chunk halaman (code-split) sedang dimuat. */
export function PageLoader({ className = 'min-h-[40vh]' }: { className?: string }) {
  return (
    <div className={className} role="status" aria-label="Memuat halaman">
      <div className="space-y-3">
        <Skeleton className="h-7 w-2/5 max-w-xs" />
        <Skeleton className="h-4 w-3/5 max-w-md" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    </div>
  );
}
