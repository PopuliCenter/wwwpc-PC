import { Badge, type BadgeTone } from '@/components/common/Badge';

export type SurveyStatus = 'draft' | 'active' | 'inactive' | 'archived';

// Hanya Aktif yang berpenanda hijau. Nonaktif = abu-abu + kotak, Diarsipkan = redup
// tanpa penanda: arsip adalah keadaan selesai, bukan bahaya.
const STATUS_META: Record<SurveyStatus, { label: string; tone: BadgeTone; dot?: boolean }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  active: { label: 'Aktif', tone: 'active' },
  inactive: { label: 'Nonaktif', tone: 'neutral', dot: true },
  archived: { label: 'Diarsipkan', tone: 'muted' },
};

/** Label status survei; dipakai sama di daftar survei dan Ringkasan. */
export function SurveyStatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status as SurveyStatus];
  if (!meta) return <Badge>{status}</Badge>;
  return (
    <Badge tone={meta.tone} dot={meta.dot}>
      {meta.label}
    </Badge>
  );
}
