import {
  AlarmClock,
  ArrowUpRight,
  Bell,
  CheckCircle2,
  Coins,
  FileText,
  Gift,
  Megaphone,
  type LucideIcon,
} from 'lucide-react';

/** Kategori penyaring di halaman Notifikasi. */
export type FeedCategory = 'survei' | 'poin' | 'reward' | 'pengumuman';

/**
 * Meta tampilan per tipe item feed notifikasi (lonceng & halaman Notifikasi):
 * ikon dan kategori. Ikon selalu gray-600; warna tidak membedakan tipe.
 * Tipe yang belum dikenal memakai ikon lonceng dan hanya tampil di "Semua".
 */
export const FEED_TYPE_META: Record<string, { icon: LucideIcon; category: FeedCategory }> = {
  survey_new: { icon: FileText, category: 'survei' },
  survey_reminder: { icon: AlarmClock, category: 'survei' },
  survey_done: { icon: CheckCircle2, category: 'survei' },
  point_earned: { icon: Coins, category: 'poin' },
  point_spent: { icon: ArrowUpRight, category: 'reward' },
  reward_fulfilled: { icon: Gift, category: 'reward' },
  announcement: { icon: Megaphone, category: 'pengumuman' },
};

export function feedTypeIcon(type: string): LucideIcon {
  return FEED_TYPE_META[type]?.icon ?? Bell;
}
