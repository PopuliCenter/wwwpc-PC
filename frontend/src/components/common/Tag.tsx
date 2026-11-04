import type { HTMLAttributes } from 'react';

/**
 * Label kategori, selalu abu-abu (Nasional/Daerah, peran, tipe pertanyaan, Aturan,
 * Mode Pratinjau). Bukan untuk status: pakai Badge. Bila lebih dari dua per baris,
 * pakai teks gray-600 dipisah titik tengah. Batasnya gray-200, bukan gray-300, karena
 * gray-300 khusus batas kontrol dan label ini tidak bisa ditekan.
 */
export function Tag({ className = '', children, ...props }: HTMLAttributes<HTMLSpanElement>) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-sm border border-gray-200 bg-panel px-1.5 py-0.5 text-xs text-gray-700 ${className}`}
      {...props}
    >
      {children}
    </span>
  );
}
