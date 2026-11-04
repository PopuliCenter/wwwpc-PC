import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, FileText, Megaphone } from 'lucide-react';
import { api } from '@/services/api';
import { IconButton } from './IconButton';
import { ListRowsSkeleton } from './Skeleton';

interface FeedItem {
  id: string;
  type: 'survey_new' | 'announcement' | string;
  title: string;
  body: string;
  link: string | null;
  readAt: string | null;
  createdAt: string;
}

function timeAgo(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = Math.max(0, Date.now() - d);
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'baru saja';
  if (m < 60) return `${m} mnt lalu`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} jam lalu`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days} hari lalu`;
  return new Date(iso).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
}

/**
 * Lonceng notifikasi responden: badge jumlah belum dibaca + panel daftar.
 * Sumber data: GET /notifications/feed (+ unread-count). Klik item → buka link.
 */
export function NotificationBell() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const fetchUnread = useCallback(async () => {
    try {
      const r = await api.get<{ count: number }>('/notifications/feed/unread-count');
      setUnread(r?.count ?? 0);
    } catch {
      /* abaikan */
    }
  }, []);

  // Hitung belum-dibaca saat muncul + poll tiap 60 dtk.
  useEffect(() => {
    void fetchUnread();
    const t = window.setInterval(fetchUnread, 60000);
    return () => window.clearInterval(t);
  }, [fetchUnread]);

  // Tutup panel saat klik di luar.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const openPanel = async () => {
    setOpen((v) => !v);
    if (open) return; // sedang menutup
    setLoading(true);
    try {
      const feed = await api.get<FeedItem[]>('/notifications/feed');
      setItems(Array.isArray(feed) ? feed : []);
      // Tandai semua dibaca begitu panel dibuka.
      if ((feed ?? []).some((f) => !f.readAt)) {
        await api.post('/notifications/feed/read', {});
        setUnread(0);
      }
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const handleItem = (it: FeedItem) => {
    setOpen(false);
    if (it.link) navigate(it.link);
  };

  return (
    <div className="relative" ref={ref}>
      <IconButton aria-label="Notifikasi" onClick={openPanel}>
        <Bell className="h-5 w-5" strokeWidth={1.75} />
        {unread > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-danger-fg px-1 text-2xs font-semibold leading-none tabular-nums text-on-danger">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </IconButton>

      {open && (
        // Di HP panel menempel ke viewport: lonceng tidak berada di tepi kanan header,
        // jadi absolute right-0 selebar 320px terpotong di layar 360px.
        <div className="fixed right-4 top-16 z-50 w-[min(320px,calc(100vw-32px))] overflow-hidden rounded-xl border border-gray-200 bg-panel shadow-lg sm:absolute sm:right-0 sm:top-full sm:mt-2">
          <div className="border-b border-gray-100 px-4 py-2.5">
            <span className="text-sm font-semibold text-gray-900">Notifikasi</span>
          </div>
          <div className="max-h-[min(24rem,calc(100dvh-13rem))] overflow-y-auto">
            {loading ? (
              <div role="status" aria-label="Memuat notifikasi">
                <ListRowsSkeleton />
              </div>
            ) : items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-gray-500">Belum ada notifikasi.</p>
            ) : (
              items.map((it) => {
                const Icon = it.type === 'announcement' ? Megaphone : FileText;
                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => handleItem(it)}
                    className={`flex w-full items-start gap-3 border-b border-gray-100 px-4 py-3 text-left transition-colors hover:bg-gray-50 ${
                      it.readAt ? '' : 'bg-gray-50'
                    }`}
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-gray-600" strokeWidth={1.75} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">{it.title}</p>
                      <p className="line-clamp-2 text-xs text-gray-600">{it.body}</p>
                      <p className="mt-0.5 text-xs text-gray-500">{timeAgo(it.createdAt)}</p>
                    </div>
                    {!it.readAt && (
                      <span className="mt-1.5 h-2 w-2 shrink-0 bg-accent-600">
                        <span className="sr-only">Belum dibaca</span>
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              navigate('/notifications');
            }}
            className="min-h-11 w-full border-t border-gray-100 px-4 py-2.5 text-center text-xs font-medium text-primary-600 hover:bg-gray-50"
          >
            Lihat semua notifikasi
          </button>
        </div>
      )}
    </div>
  );
}
