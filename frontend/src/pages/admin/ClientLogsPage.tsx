import { useCallback, useEffect, useState } from 'react';
import { Bug, Smartphone, Monitor, Trash2, ChevronDown, Search, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { api } from '@/services/api';
import { useConfirm } from '@/components/common/ConfirmDialog';
import { showAppNotice } from '@/stores/notification.store';

interface ClientLog {
  id: string;
  level: string;
  message: string;
  stack: string | null;
  source: string | null;
  platform: string | null;
  deviceType: string | null;
  appVersion: string | null;
  userAgent: string | null;
  userEmail: string | null;
  context: Record<string, unknown> | null;
  ipAddress: string | null;
  createdAt: string;
}

interface ListResponse {
  data: ClientLog[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const LEVEL_TONE: Record<string, string> = {
  error: 'bg-red-100 text-red-700',
  warn: 'bg-amber-100 text-amber-700',
  info: 'bg-sky-100 text-sky-700',
};

function PlatformIcon({ platform }: { platform: string | null }) {
  if (platform === 'android' || platform === 'ios') return <Smartphone className="h-3.5 w-3.5" />;
  return <Monitor className="h-3.5 w-3.5" />;
}

function LogRow({ log, onDelete }: { log: ClientLog; onDelete: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="overflow-hidden">
      <div className="flex items-start gap-3 px-4 py-3">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-0.5 flex min-w-0 flex-1 items-start gap-3 text-left"
        >
          <span
            className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
              LEVEL_TONE[log.level] ?? 'bg-gray-100 text-gray-600'
            }`}
          >
            {log.level}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-gray-900">{log.message}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-gray-400">
              <span className="inline-flex items-center gap-1">
                <PlatformIcon platform={log.platform} /> {log.platform ?? '-'}
                {log.deviceType ? ` · ${log.deviceType}` : ''}
              </span>
              {log.appVersion && <span>v{log.appVersion}</span>}
              {log.source && <span className="truncate">{log.source}</span>}
              {log.userEmail && <span className="truncate">{log.userEmail}</span>}
              <span>{format(new Date(log.createdAt), 'dd/MM/yyyy HH:mm:ss')}</span>
            </p>
          </div>
          <ChevronDown
            className={`mt-1 h-4 w-4 shrink-0 text-gray-300 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>
        <button
          type="button"
          onClick={() => onDelete(log.id)}
          title="Hapus"
          className="shrink-0 rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      {open && (
        <div className="space-y-2 border-t border-gray-100 bg-gray-50/60 px-4 py-3 text-xs">
          {log.stack && (
            <div>
              <p className="mb-1 font-semibold text-gray-600">Stack</p>
              <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded-lg bg-gray-900 p-3 text-[11px] leading-relaxed text-gray-100">
                {log.stack}
              </pre>
            </div>
          )}
          {log.context && (
            <div>
              <p className="mb-1 font-semibold text-gray-600">Konteks</p>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg bg-white p-2 ring-1 ring-gray-200">
                {JSON.stringify(log.context, null, 2)}
              </pre>
            </div>
          )}
          <p className="text-gray-400">
            {log.userAgent}
            {log.ipAddress ? ` · IP ${log.ipAddress}` : ''}
          </p>
        </div>
      )}
    </li>
  );
}

export function ClientLogsPage() {
  const [logs, setLogs] = useState<ClientLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [level, setLevel] = useState('');
  const [platform, setPlatform] = useState('');
  const [search, setSearch] = useState('');
  const { confirm, dialog } = useConfirm();

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const q = new URLSearchParams({ pageSize: '50' });
      if (level) q.set('level', level);
      if (platform) q.set('platform', platform);
      if (search.trim()) q.set('search', search.trim());
      const res = await api.get<ListResponse>(`/admin/client-logs?${q.toString()}`);
      setLogs(res.data ?? []);
      setTotal(res.total ?? 0);
    } catch {
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [level, platform, search]);

  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: 'Hapus log',
      message: 'Hapus entri log ini?',
      confirmText: 'Hapus',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/admin/client-logs/${id}`);
      setLogs((prev) => prev.filter((l) => l.id !== id));
    } catch (e) {
      showAppNotice({
        title: 'Gagal menghapus',
        body: (e as { message?: string })?.message,
        tone: 'error',
      });
    }
  };

  const handlePurge = async () => {
    const ok = await confirm({
      title: 'Bersihkan log lama',
      message: 'Hapus semua log error lebih lama dari 30 hari?',
      confirmText: 'Bersihkan',
      danger: true,
    });
    if (!ok) return;
    try {
      const res = await api.delete<{ deleted: number }>('/admin/client-logs/purge', {
        body: { olderThanDays: 30 },
      });
      showAppNotice({ title: `${res.deleted} log dibersihkan`, tone: 'success' });
      void fetchLogs();
    } catch (e) {
      showAppNotice({
        title: 'Gagal membersihkan',
        body: (e as { message?: string })?.message,
        tone: 'error',
      });
    }
  };

  return (
    <div className="space-y-5">
      {dialog}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight text-gray-900">
            <Bug className="h-6 w-6 text-primary-600" /> Monitoring Error
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            Error frontend/aplikasi yang dilaporkan otomatis ({total} entri).
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void fetchLogs()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-200 px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4" /> Muat ulang
          </button>
          <button
            type="button"
            onClick={handlePurge}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" /> Bersihkan &gt;30 hari
          </button>
        </div>
      </div>

      {/* Filter */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={level}
          onChange={(e) => setLevel(e.target.value)}
          className="rounded-lg border border-gray-300 py-2 pl-3 pr-8 text-sm"
        >
          <option value="">Semua level</option>
          <option value="error">Error</option>
          <option value="warn">Warning</option>
          <option value="info">Info</option>
        </select>
        <select
          value={platform}
          onChange={(e) => setPlatform(e.target.value)}
          className="rounded-lg border border-gray-300 py-2 pl-3 pr-8 text-sm"
        >
          <option value="">Semua platform</option>
          <option value="web">Web</option>
          <option value="android">Android</option>
          <option value="ios">iOS</option>
        </select>
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari pesan / sumber…"
            className="w-full rounded-lg border border-gray-300 py-2 pl-9 pr-3 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          />
        </div>
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-gray-400">Memuat…</p>
      ) : logs.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center">
          <Bug className="mx-auto mb-3 h-10 w-10 text-gray-300" />
          <p className="text-gray-600">Belum ada error yang dilaporkan. 🎉</p>
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 overflow-hidden rounded-2xl border border-gray-200 bg-white">
          {logs.map((log) => (
            <LogRow key={log.id} log={log} onDelete={handleDelete} />
          ))}
        </ul>
      )}
    </div>
  );
}
