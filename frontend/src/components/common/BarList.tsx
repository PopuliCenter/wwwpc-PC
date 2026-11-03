export interface BarListItem {
  label: string;
  count: number;
}

interface BarListProps {
  items: BarListItem[];
  /** Pemetaan label mentah ke teks tampilan (mis. kode gender). */
  labelMap?: Record<string, string>;
  /** Jumlah baris teratas sebelum sisanya digabung. Bawaan 6. */
  limit?: number;
  otherLabel?: string;
  emptyText?: string;
  className?: string;
}

const pctFormat = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 1 });
const countFormat = new Intl.NumberFormat('id-ID');

/**
 * Sebaran kategori sebagai daftar batang (pengganti donut): urut menurun, enam
 * teratas + "Lainnya", jumlah dan persen tertulis. Panjang batang = persen dari
 * total, jadi angka dan batang selalu sama-sama benar. Urutan masukan tidak diubah.
 */
export function BarList({
  items,
  labelMap,
  limit = 6,
  otherLabel = 'Lainnya',
  emptyText = 'Belum ada data.',
  className = '',
}: BarListProps) {
  if (items.length === 0) return <p className="text-sm text-gray-500">{emptyText}</p>;

  const sorted = [...items].sort((a, b) => b.count - a.count);
  const total = sorted.reduce((sum, it) => sum + it.count, 0);
  const shown = sorted.slice(0, limit).map((it) => ({
    key: it.label,
    label: labelMap?.[it.label] ?? it.label,
    count: it.count,
  }));
  const rest = sorted.slice(limit);
  if (rest.length > 0) {
    shown.push({
      key: '__lainnya__',
      label: otherLabel,
      count: rest.reduce((sum, it) => sum + it.count, 0),
    });
  }

  return (
    <ul className={`space-y-3 ${className}`}>
      {shown.map((it) => {
        const pct = total > 0 ? (it.count / total) * 100 : 0;
        return (
          <li key={it.key}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 truncate text-gray-800" title={it.label}>
                {it.label}
              </span>
              <span className="shrink-0 text-gray-600 tabular-nums">
                <span className="font-medium text-gray-900">{countFormat.format(it.count)}</span>
                {' · '}
                {pctFormat.format(pct)}%
              </span>
            </div>
            <div className="mt-1 h-2 bg-gray-100" aria-hidden="true">
              <div className="h-full bg-primary-600" style={{ width: `${pct}%` }} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
