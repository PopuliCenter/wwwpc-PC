/**
 * Placeholder berkilau (shimmer) saat memuat data — pengganti spinner. Memberi
 * kesan lebih cepat karena bentuk konten sudah terlihat sebelum data tiba.
 * Kelas `.skeleton` didefinisikan di globals.css (menghormati reduced-motion).
 */
export function Skeleton({ className = '' }: { className?: string }) {
  return <div className={`skeleton rounded-md ${className}`} aria-hidden="true" />;
}

/** Kerangka satu baris daftar survei responden (judul, meta, tombol). */
export function SurveyRowSkeleton() {
  return (
    <div className="space-y-2.5 p-4">
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-11 w-full rounded-lg" />
    </div>
  );
}

/** Kerangka satu pertanyaan: teks pertanyaan + opsi jawaban. */
export function QuestionSkeleton({ options = 4 }: { options?: number }) {
  return (
    <div className="space-y-3 p-4 sm:p-5">
      <Skeleton className="h-5 w-11/12" />
      <Skeleton className="h-5 w-2/3" />
      <div className="space-y-2 pt-2">
        {Array.from({ length: options }, (_, i) => (
          <Skeleton key={i} className="h-12 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

/** Kerangka daftar baris teks (notifikasi, riwayat, katalog). */
export function ListRowsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="divide-y divide-gray-100">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="space-y-2 px-4 py-3">
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}

/** Kerangka isi tabel laporan; bungkus dengan panel yang sama seperti tabel aslinya. */
export function TableSkeleton({ rows = 5, cols = 4 }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y divide-gray-100">
      {Array.from({ length: rows }, (_, r) => (
        <div
          key={r}
          className="grid gap-4 px-4 py-3.5"
          style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} className="h-4 w-full" />
          ))}
        </div>
      ))}
    </div>
  );
}
