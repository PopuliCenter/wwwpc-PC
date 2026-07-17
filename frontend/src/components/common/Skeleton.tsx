/**
 * Placeholder berkilau (shimmer) saat memuat data — pengganti spinner. Memberi
 * kesan lebih cepat karena bentuk konten sudah terlihat sebelum data tiba.
 * Kelas `.skeleton` didefinisikan di globals.css (menghormati reduced-motion).
 */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton rounded-md ${className}`} aria-hidden="true" />;
}

/** Kerangka satu kartu survei (dipakai di daftar survei responden saat memuat). */
export function SurveyCardSkeleton() {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-2.5">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-1/2" />
        </div>
        <Skeleton className="h-8 w-16 shrink-0 rounded-full" />
      </div>
      <div className="mt-4 flex items-center gap-3">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-4 w-20" />
      </div>
    </div>
  );
}
