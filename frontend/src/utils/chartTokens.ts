/**
 * Warna grafik dan peta untuk pustaka yang tidak bisa memakai kelas Tailwind (recharts,
 * leaflet). Nilainya var(--color-*) agar mengikuti tema tanpa digambar ulang: berlaku
 * untuk atribut SVG dan gaya inline, tetapi tidak untuk kanvas (Leaflet di sini memakai
 * renderer SVG) atau perhitungan warna. Maksimal tiga seri, selalu dengan label langsung:
 * warna tidak boleh berdiri sendiri.
 */

/** Seri pertama, dan warna batang/peta utama. */
export const navy1 = 'var(--color-primary-600)';
/** Seri kedua. */
export const orange2 = 'var(--color-accent-500)';
/** Seri ketiga. */
export const gray3 = 'var(--color-gray-400)';
/** Titik data terbaru (accent-600). */
export const latestPoint = 'var(--color-accent-600)';
/** Garis kisi. */
export const grid = 'var(--color-gray-200)';
/** Teks dan garis sumbu. */
export const axis = 'var(--color-gray-500)';
/** Kategori "Lainnya" atau tanpa data. */
export const other = 'var(--color-chart-other)';
/** Garis kursor tooltip pada grafik garis. */
export const chartCursor = 'var(--color-chart-cursor)';
/** Cincin titik aktif: menyatu dengan latar panel grafik. */
export const activeDotRing = 'var(--color-panel)';

/** Latar dan teks kotak tooltip grafik. */
export const tooltipBackground = 'var(--color-panel)';
export const tooltipText = 'var(--color-gray-900)';
/** Teks tooltip peta: label, nilai utama, keterangan. */
export const tooltipLabel = 'var(--color-gray-500)';
export const tooltipValue = 'var(--color-gray-700)';
export const tooltipMuted = 'var(--color-gray-400)';

/**
 * Skala sekuensial dari nilai rendah ke tinggi. Di tema terang sama dengan primary-100
 * sampai primary-800; di tema gelap arahnya berbalik sehingga nilai tinggi makin terang.
 */
export const sequential = [
  'var(--color-seq-1)',
  'var(--color-seq-2)',
  'var(--color-seq-3)',
  'var(--color-seq-4)',
  'var(--color-seq-5)',
  'var(--color-seq-6)',
  'var(--color-seq-7)',
  'var(--color-seq-8)',
] as const;

/** Warna skala sekuensial untuk `value` di rentang 0..`max`, mengikuti tema aktif. */
export function sequentialColor(value: number, max: number): string {
  if (max <= 0 || value <= 0) return sequential[0];
  const i = Math.min(sequential.length - 1, Math.floor((value / max) * sequential.length));
  return sequential[i];
}

export const chartTokens = {
  navy1,
  orange2,
  gray3,
  latestPoint,
  grid,
  axis,
  other,
  chartCursor,
  activeDotRing,
  tooltipBackground,
  tooltipText,
  tooltipLabel,
  tooltipValue,
  tooltipMuted,
  sequential,
} as const;
