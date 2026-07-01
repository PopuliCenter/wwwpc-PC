import { Loader2 } from 'lucide-react';

/** Fallback ringan saat chunk halaman (code-split) sedang dimuat. */
export function PageLoader() {
  return (
    <div className="flex min-h-[40vh] items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-primary-500" />
    </div>
  );
}
