/**
 * Warna grafik dan peta sebagai hex, untuk pustaka yang tidak bisa memakai kelas
 * Tailwind (recharts, leaflet). Nilainya mengikuti token di globals.css. Maksimal
 * tiga seri, selalu dengan label langsung: warna tidak boleh berdiri sendiri.
 */

/** Seri pertama, dan warna batang/peta utama. */
export const navy1 = '#234E8C';
/** Seri kedua. */
export const orange2 = '#F26522';
/** Seri ketiga. */
export const gray3 = '#656D71';
/** Titik data terbaru (accent-600). */
export const latestPoint = '#D4500F';
/** Garis kisi. */
export const grid = '#DFE2E3';
/** Teks dan garis sumbu. */
export const axis = '#586064';
/** Kategori "Lainnya" atau tanpa data. */
export const other = '#C9CDD0';

/** Teks tooltip peta: label, nilai utama, keterangan. */
export const tooltipLabel = '#586064';
export const tooltipValue = '#383F43';
export const tooltipMuted = '#656D71';

/** Skala sekuensial primary-100 sampai primary-800, dari nilai rendah ke tinggi. */
export const sequential = [
  '#D6E4F5',
  '#AECAE9',
  '#7BA6D8',
  '#4D80C4',
  '#2F63AB',
  '#234E8C',
  '#1C3F72',
  '#16315A',
] as const;

/** Warna skala sekuensial untuk `value` di rentang 0..`max`. */
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
  tooltipLabel,
  tooltipValue,
  tooltipMuted,
  sequential,
} as const;
