import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  CheckCircle2,
  Coins,
  ArrowUpRight,
  Gift,
  Megaphone,
  Trash2,
  Bell,
  type LucideIcon,
} from 'lucide-react';
import { api } from '@/services/api';

interface FeedItem {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

type Category = 'semua' | 'survei' | 'poin' | 'reward' | 'pengumuman';

// Meta tampilan per tipe notifikasi: ikon, warna, dan kategori penyaring.
const TYPE_META: Record<string, { icon: LucideIcon; color: string; category: Exclude<Category, 'semua'> }> = {
  survey_new: { icon: FileText, color: 'text-indigo-600', category: 'survei' },
  survey_done: { icon: CheckCircle2, color: 'text-emerald-600', category: 'survei' },
  point_earned: { icon: Coins, color: 'text-amber-500', category: 'poin' },
  point_spent: { icon: ArrowUpRight, color: 'text-rose-500', category: 'reward' },
  reward_fulfilled: { icon: Gift, color: 'text-emerald-600', category: 'reward' },
  announcement: { icon: Megaphone, color: 'text-primary-600', category: 'pengumuman' },
};

const FILTERS: { key: Category; label: string }[] = [
  { key: 'semua', label: 'Semua' },
  { key: 'survei', label: 'Survei' },
  { key: 'poin', label: 'Poin' },
  { key: 'reward', label: 'Reward' },
  { key: 'pengumuman', label: 'Pengumuman' },
];

function timeAgo(iso: string): string {
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'baru saja';
  if (m < 60) return `${m} mnt lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days} hari lalu`;
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function NotificationsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Category>('semua');

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const feed = await api.get<FeedItem[]>('/notifications/feed?limit=100');
        if (active) setItems(Array.isArray(feed) ? feed : []);
        // Tandai semua dibaca saat halaman dibuka.
        await api.post('/notifications/feed/read', {}).catch(() => {});
      } catch {
        if (active) setItems([]);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(
    () =>
      filter === 'semua'
        ? items
        : items.filter((it) => TYPE_META[it.type]?.category === filter),
    [items, filter],
  );

  const deleteOne = async (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id)); // optimistis
    await api.delete(`/notifications/feed/${id}`).catch(() => {});
  };

  const clearAll = async () => {
    if (!items.length) return;
    if (!window.confirm('Hapus semua notifikasi?')) return;
    setItems([]);
    await api.delete('/notifications/feed').catch(() => {});
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-2xl font-bold text-gray-900">
          <Bell className="h-6 w-6 text-primary-600" /> Notifikasi
        </h1>
        {items.length > 0 && (
          <button
            type="button"
            onClick={clearAll}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
          >
            <Trash2 className="h-3.5 w-3.5" /> Hapus semua
          </button>
        )}
      </div>

      {/* Kategori */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              filter === f.key
                ? 'bg-primary-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Daftar */}
      {loading ? (
        <p className="py-10 text-center text-sm text-gray-400">Memuat…</p>
      ) : filtered.length === 0 ? (
        <p className="py-12 text-center text-sm text-gray-400">
          {filter === 'semua' ? 'Belum ada notifikasi.' : 'Tidak ada notifikasi di kategori ini.'}
        </p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((it) => {
            const meta = TYPE_META[it.type] ?? { icon: Bell, color: 'text-gray-500' };
            const Icon = meta.icon;
            return (
              <li
                key={it.id}
                className={`flex items-start gap-3 rounded-xl border border-gray-200 bg-white p-3 ${
                  it.readAt ? '' : 'ring-1 ring-primary-100'
                }`}
              >
                <span className={`mt-0.5 shrink-0 ${meta.color}`}>
                  <Icon className="h-5 w-5" />
                </span>
                <button
                  type="button"
                  onClick={() => it.link && navigate(it.link)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="text-sm font-medium text-gray-900">{it.title}</p>
                  <p className="text-xs leading-relaxed text-gray-600">{it.body}</p>
                  <p className="mt-0.5 text-[11px] text-gray-400">{timeAgo(it.createdAt)}</p>
                </button>
                <button
                  type="button"
                  onClick={() => deleteOne(it.id)}
                  aria-label="Hapus notifikasi"
                  className="shrink-0 rounded-lg p-1.5 text-gray-300 transition-colors hover:bg-gray-100 hover:text-rose-500"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
