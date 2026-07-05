import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';

/**
 * Penyeragam state async: loading / error / kosong / konten. Menggantikan pola
 * berulang `if (loading) return <div>Memuat...</div>` + blok error terpisah di
 * banyak halaman, sekaligus menambah tombol "Coba lagi" opsional untuk error.
 *
 * Pemakaian sebagai pembungkus:
 *   <AsyncState loading={loading} error={error} isEmpty={rows.length === 0} onRetry={refetch}>
 *     <Table rows={rows} />
 *   </AsyncState>
 *
 * Atau langsung sebagai early-return: `if (loading) return <LoadingState />`.
 */

const panelClass = 'p-8 text-center text-sm text-gray-500';

function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={className ?? panelClass}>{children}</div>;
}

/** Indikator memuat (terpusat). */
export function LoadingState({
  text = 'Memuat...',
  className,
}: {
  text?: string;
  className?: string;
}) {
  return (
    <Panel className={className}>
      <span className="inline-flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin text-primary-500" />
        {text}
      </span>
    </Panel>
  );
}

/** Tampilan error + tombol "Coba lagi" opsional. */
export function ErrorState({
  message = 'Terjadi kesalahan.',
  onRetry,
  className,
}: {
  message?: string;
  onRetry?: () => void;
  className?: string;
}) {
  return (
    <Panel className={className}>
      <span className="text-red-600">{message}</span>
      {onRetry && (
        <div className="mt-3">
          <button
            type="button"
            onClick={onRetry}
            className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
          >
            Coba lagi
          </button>
        </div>
      )}
    </Panel>
  );
}

interface AsyncStateProps {
  loading?: boolean;
  error?: string | null;
  /** True → tampilkan pesan kosong alih-alih children (setelah tidak loading/error). */
  isEmpty?: boolean;
  loadingText?: string;
  emptyText?: string;
  onRetry?: () => void;
  /** Kelas panel untuk state non-konten (default: p-8 text-center). */
  panelClassName?: string;
  children: ReactNode;
}

/** Pembungkus deklaratif: pilih loading / error / kosong / konten. */
export function AsyncState({
  loading,
  error,
  isEmpty,
  loadingText,
  emptyText = 'Belum ada data.',
  onRetry,
  panelClassName,
  children,
}: AsyncStateProps) {
  if (loading) return <LoadingState text={loadingText} className={panelClassName} />;
  if (error) return <ErrorState message={error} onRetry={onRetry} className={panelClassName} />;
  if (isEmpty) return <Panel className={panelClassName}>{emptyText}</Panel>;
  return <>{children}</>;
}
