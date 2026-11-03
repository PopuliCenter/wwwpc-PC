import { Check } from 'lucide-react';
import { Badge } from '@/components/common/Badge';

const statusLabels: Record<string, string> = {
  completed: 'Selesai',
  partial: 'Sebagian',
  abandoned: 'Ditinggalkan',
};

/**
 * Status respons, dipakai daftar dan detail. Ditinggalkan bukan error, jadi abu-abu.
 * Selesai memakai teks gelap dengan centang hijau: warnanya hanya di ikon, sehingga
 * tidak memakai Badge success yang mewarnai teksnya juga. Sebagian memakai penanda kotak,
 * bukan segitiga, agar tidak tertukar dengan Duplikat yang tampil di baris yang sama.
 */
export function ResponseStatusLabel({ status }: { status: string }) {
  const label = statusLabels[status] ?? status;
  if (status === 'completed') {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-800">
        <Check
          className="h-3.5 w-3.5 shrink-0 text-success-fg"
          strokeWidth={1.75}
          aria-hidden="true"
        />
        {label}
      </span>
    );
  }
  if (status === 'partial') {
    return (
      <Badge tone="warning" dot>
        {label}
      </Badge>
    );
  }
  return <Badge tone="muted">{label}</Badge>;
}
