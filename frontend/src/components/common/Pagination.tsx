import { Button } from './Button';

interface PaginationProps {
  page: number;
  limit: number;
  total: number;
  onPageChange: (page: number) => void;
}

/**
 * Pengendali halaman di kaki tabel: rentang baris yang tampil, Sebelumnya/Berikutnya,
 * dan maksimal lima nomor halaman di sekitar halaman aktif. Tidak tampil bila hanya
 * ada satu halaman.
 */
export function Pagination({ page, limit, total, onPageChange }: PaginationProps) {
  const totalPages = Math.ceil(total / limit);
  if (totalPages <= 1) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 px-4 py-3">
      <p className="text-sm tabular-nums text-gray-600">
        Menampilkan {(page - 1) * limit + 1}-{Math.min(page * limit, total)} dari {total}
      </p>
      <div className="flex flex-wrap gap-1">
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(Math.max(1, page - 1))}
          disabled={page === 1}
        >
          Sebelumnya
        </Button>
        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
          const startPage = Math.max(1, Math.min(page - 2, totalPages - 4));
          const pageNum = startPage + i;
          if (pageNum > totalPages) return null;
          return (
            <Button
              key={pageNum}
              type="button"
              variant="secondary"
              size="sm"
              aria-current={page === pageNum ? 'page' : undefined}
              onClick={() => onPageChange(pageNum)}
              // Halaman aktif = keadaan "di sini", senada SegmentedControl; bukan aksi utama.
              className={`min-w-11 tabular-nums lg:min-w-9 ${
                page === pageNum ? 'bg-primary-50! text-primary-700!' : ''
              }`}
            >
              {pageNum}
            </Button>
          );
        })}
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={() => onPageChange(Math.min(totalPages, page + 1))}
          disabled={page === totalPages}
        >
          Berikutnya
        </Button>
      </div>
    </div>
  );
}
