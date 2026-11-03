import { useCallback, useEffect, useState } from 'react';
import { Smartphone, Monitor, Trash2, ChevronDown, Search, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { api } from '@/services/api';
import { Badge, type BadgeTone } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import { useConfirm } from '@/components/common/ConfirmDialog';
import { IconButton } from '@/components/common/IconButton';
import { ListRowsSkeleton } from '@/components/common/Skeleton';
import { fieldCls } from '@/components/common/fieldStyles';
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

const LEVEL_TONE: Record<string, BadgeTone> = {
  error: 'danger',
  warn: 'warning',
  info: 'neutral',
};

function PlatformIcon({ platform }: { platform: string | null }) {
  const Icon = platform === 'android' || platform === 'ios' ? Smartphone : Monitor;
  return <Icon className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />;
}

function LogRow({ log, onDelete }: { log: ClientLog; onDelete: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="overflow-hidden">
      <div className="flex items-start gap-3 px-4 py-3">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="mt-0.5 flex min-h-11 min-w-0 flex-1 items-start gap-3 text-left lg:min-h-0"
        >
          <Badge tone={LEVEL_TONE[log.level] ?? 'neutral'} dot className="mt-0.5 shrink-0">
            {log.level}
          </Badge>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-gray-900">{log.message}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-gray-500">
              <span className="inline-flex items-center gap-1">
                <PlatformIcon platform={log.platform} /> {log.platform ?? '-'}
                {log.deviceType ? ` · ${log.deviceType}` : ''}
              </span>
              {log.appVersion && <span>v{log.appVersion}</span>}
              {log.source && <span className="truncate">{log.source}</span>}
              {log.userEmail && <span className="truncate">{log.userEmail}</span>}
              <span className="tabular-nums">
                {format(new Date(log.createdAt), 'dd/MM/yyyy HH:mm:ss')}
              </span>
            </p>
          </div>
          <ChevronDown
            className={`mt-1 h-4 w-4 shrink-0 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}
            strokeWidth={1.75}
            aria-hidden="true"
          />
        </button>
        <IconButton aria-label="Hapus" destructive onClick={() => onDelete(log.id)}>
          <Trash2 className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </IconButton>
      </div>
      {open && (
        <div className="space-y-2 border-t border-gray-100 bg-gray-50 px-4 py-3 text-xs">
          {log.stack && (
            <div>
              <p className="mb-1 font-semibold text-gray-600">Stack</p>
              <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded-lg bg-gray-900 p-3 text-xs leading-relaxed text-gray-100">
                {log.stack}
              </pre>
            </div>
          )}
          {log.context && (
            <div>
              <p className="mb-1 font-semibold text-gray-600">Konteks</p>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-lg border border-gray-200 bg-white p-2">
                {JSON.stringify(log.context, null, 2)}
              </pre>
            </div>
          )}
          <p className="text-gray-500">
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
    <div className="space-y-6">
      {dialog}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Monitoring Error</h1>
          <p className="mt-1 text-sm text-gray-600">
            Error frontend/aplikasi yang dilaporkan otomatis ({total} entri).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" onClick={() => void fetchLogs()}>
            <RefreshCw className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" /> Muat ulang
          </Button>
          <Button type="button" variant="secondary" onClick={handlePurge}>
            <Trash2 className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" /> Bersihkan &gt;30
            hari
          </Button>
        </div>
      </div>

      {/* Filter */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-full sm:w-44">
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value)}
            aria-label="Filter level"
            className={fieldCls}
          >
            <option value="">Semua level</option>
            <option value="error">Error</option>
            <option value="warn">Warning</option>
            <option value="info">Info</option>
          </select>
        </div>
        <div className="w-full sm:w-44">
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value)}
            aria-label="Filter platform"
            className={fieldCls}
          >
            <option value="">Semua platform</option>
            <option value="web">Web</option>
            <option value="android">Android</option>
            <option value="ios">iOS</option>
          </select>
        </div>
        <div className="relative min-w-[200px] flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500"
            strokeWidth={1.75}
            aria-hidden="true"
          />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cari pesan / sumber…"
            aria-label="Cari log"
            className={`${fieldCls} pl-9`}
          />
        </div>
      </div>

      {loading ? (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <ListRowsSkeleton rows={5} />
        </div>
      ) : logs.length === 0 ? (
        <div className="rounded-xl border border-gray-200 bg-white p-10 text-center">
          <p className="text-gray-600">Belum ada error yang dilaporkan.</p>
        </div>
      ) : (
        <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
          {logs.map((log) => (
            <LogRow key={log.id} log={log} onDelete={handleDelete} />
          ))}
        </ul>
      )}
    </div>
  );
}
