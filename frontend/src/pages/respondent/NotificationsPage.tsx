import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { api } from '@/services/api';
import { announceFeedRead, subscribeFeed } from '@/services/notificationFeed';
import { Button, useTapFeedback } from '@/components/common/Button';
import { UnderlineTabs } from '@/components/common/UnderlineTabs';
import { useConfirm } from '@/components/common/ConfirmDialog';
import { IconButton } from '@/components/common/IconButton';
import { ListRowsSkeleton } from '@/components/common/Skeleton';
import {
  FEED_TYPE_META,
  feedTypeIcon,
  type FeedCategory,
} from '@/components/common/notificationTypes';

interface FeedItem {
  id: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

// Ikon & kategori per tipe ada di notificationTypes.ts (dipakai bersama lonceng).
type Category = 'semua' | FeedCategory;

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
  return new Date(iso).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function NotificationsPage() {
  const navigate = useNavigate();
  const tap = useTapFeedback();
  const { confirm, dialog } = useConfirm();
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Category>('semua');

  useEffect(() => {
    let active = true;
    const load = async (initial: boolean) => {
      try {
        const feed = await api.get<FeedItem[]>('/notifications/feed?limit=100');
        if (!active) return;
        setItems(Array.isArray(feed) ? feed : []);
      } catch {
        // Refresh latar yang gagal tidak menghapus daftar yang sedang tampil.
        if (active && initial) setItems([]);
        return;
      } finally {
        if (active) setLoading(false);
      }
      // Tandai semua dibaca saat halaman dibuka (dan saat notifikasi baru masuk
      // selagi terbuka), lalu kabari lonceng agar badge ikut nol.
      const ok = await api.post('/notifications/feed/read', {}).then(
        () => true,
        () => false,
      );
      if (ok) announceFeedRead();
    };
    void load(true);
    // Push tiba / aplikasi kembali ke depan → ambil ulang daftar tanpa skeleton.
    const unsubscribe = subscribeFeed((event) => {
      if (event === 'changed') void load(false);
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const filtered = useMemo(
    () =>
      filter === 'semua'
        ? items
        : items.filter((it) => FEED_TYPE_META[it.type]?.category === filter),
    [items, filter],
  );

  const deleteOne = async (id: string) => {
    setItems((prev) => prev.filter((it) => it.id !== id)); // optimistis
    await api.delete(`/notifications/feed/${id}`).catch(() => {});
  };

  const clearAll = async () => {
    if (!items.length) return;
    const ok = await confirm({
      title: 'Hapus notifikasi',
      message: 'Hapus semua notifikasi?',
      confirmText: 'Hapus',
      danger: true,
    });
    if (!ok) return;
    setItems([]);
    await api.delete('/notifications/feed').catch(() => {});
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {dialog}
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Notifikasi</h1>
        {items.length > 0 && (
          <Button type="button" variant="secondary" size="sm" onClick={clearAll}>
            <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" /> Hapus semua
          </Button>
        )}
      </div>

      {/* Kategori */}
      <UnderlineTabs items={FILTERS} active={filter} onChange={setFilter} />

      {/* Daftar */}
      {loading ? (
        <div className="rounded-xl border border-gray-200 bg-panel">
          <ListRowsSkeleton rows={5} />
        </div>
      ) : filtered.length === 0 ? (
        <p className="py-12 text-center text-sm text-gray-600">
          {filter === 'semua' ? 'Belum ada notifikasi.' : 'Tidak ada notifikasi di kategori ini.'}
        </p>
      ) : (
        <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-panel">
          {filtered.map((it) => {
            const Icon = feedTypeIcon(it.type);
            const unread = !it.readAt;
            return (
              <li key={it.id} className="flex items-start gap-3 p-3">
                <Icon
                  className="mt-0.5 h-5 w-5 shrink-0 text-gray-600"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                <button
                  type="button"
                  onClick={(e) => {
                    if (!it.link) return;
                    tap(e);
                    navigate(it.link);
                  }}
                  className="min-h-11 min-w-0 flex-1 rounded-md text-left"
                >
                  <p className={`text-sm text-gray-900 ${unread ? 'font-medium' : 'font-normal'}`}>
                    {unread && (
                      <>
                        <span
                          className="mr-1.5 inline-block h-2 w-2 bg-accent-600 align-middle"
                          aria-hidden="true"
                        />
                        <span className="sr-only">Belum dibaca: </span>
                      </>
                    )}
                    {it.title}
                  </p>
                  <p className="text-xs leading-relaxed text-gray-600">{it.body}</p>
                  <p className="mt-0.5 text-xs tabular-nums text-gray-500">
                    {timeAgo(it.createdAt)}
                  </p>
                </button>
                <IconButton
                  aria-label="Hapus notifikasi"
                  destructive
                  onClick={() => deleteOne(it.id)}
                >
                  <Trash2 className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" />
                </IconButton>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
