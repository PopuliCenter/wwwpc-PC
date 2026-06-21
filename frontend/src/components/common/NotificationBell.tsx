import { useEffect, useRef, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, FileText, Megaphone, Check } from 'lucide-react';
import { api } from '@/services/api';

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
      <button
        type="button"
        aria-label="Notifikasi"
        onClick={openPanel}
        className="relative text-gray-500 transition-colors hover:text-gray-700"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-2.5">
            <span className="text-sm font-semibold text-gray-900">Notifikasi</span>
            <Check className="h-4 w-4 text-gray-400" />
          </div>
          <div className="max-h-96 overflow-y-auto">
            {loading ? (
              <p className="px-4 py-6 text-center text-sm text-gray-400">Memuat…</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-gray-400">
                Belum ada notifikasi.
              </p>
            ) : (
              items.map((it) => {
                const Icon = it.type === 'announcement' ? Megaphone : FileText;
                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => handleItem(it)}
                    className={`flex w-full items-start gap-3 border-b border-gray-50 px-4 py-3 text-left transition-colors hover:bg-gray-50 ${
                      it.readAt ? '' : 'bg-indigo-50/40'
                    }`}
                  >
                    <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-gray-900">{it.title}</p>
                      <p className="line-clamp-2 text-xs text-gray-600">{it.body}</p>
                      <p className="mt-0.5 text-[11px] text-gray-400">{timeAgo(it.createdAt)}</p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
