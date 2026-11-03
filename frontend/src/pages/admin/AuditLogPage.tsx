import { useState, useEffect, useCallback, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { api } from '@/services/api';
import { useAuthStore } from '@/stores/auth.store';
import { pollAndDownloadExport } from '@/utils/exportDownload';
import { format } from 'date-fns';
import { Button } from '@/components/common/Button';
import { thBaseCls, tdBaseCls } from '@/components/common/tableStyles';
import { Pagination } from '@/components/common/Pagination';
import { RowCheckbox } from '@/components/common/RowCheckbox';
import { useConfirm } from '@/components/common/ConfirmDialog';
import { Notice, type NoticeTone } from '@/components/common/Notice';
import { TableSkeleton } from '@/components/common/Skeleton';
import { fieldCls, fieldInvalidCls } from '@/components/common/fieldStyles';

// Tabel gaya laporan: garis tebal navy di bawah kepala, garis tipis antar baris.
const thCls = `${thBaseCls} whitespace-nowrap py-2.5 text-left`;
const tdBase = `${tdBaseCls} text-sm`;
const tdCls = `${tdBase} py-3 text-gray-600`;
const labelCls = 'mb-1 block text-sm font-medium text-gray-700';

interface PageMessage {
  text: string;
  tone: NoticeTone;
}

// Types
interface AuditLogEntry {
  id: string;
  userId: string;
  userName?: string | null;
  userRole?: string | null;
  userEmail?: string | null;
  userExists?: boolean;
  actionType: string;
  module: string;
  ipAddress: string;
  details?: Record<string, unknown> | string | null;
  createdAt: string;
}

const roleLabels: Record<string, string> = {
  super_admin: 'Super Admin',
  admin: 'Admin',
  analyst: 'Analis',
  viewer: 'Viewer',
  respondent: 'Responden',
};

/** Hanya aksi destruktif yang berwarna; aksi lain teks biasa agar log tetap tenang. */
function actionTone(action: string): string {
  if (action.includes('delete') || action.includes('cleanup')) return 'text-danger-fg';
  return 'text-gray-700';
}

/** Render details (objek JSONB / string) jadi teks aman untuk React. */
function formatDetails(details?: Record<string, unknown> | string | null): string {
  if (!details) return '-';
  if (typeof details === 'string') return details;
  try {
    const entries = Object.entries(details);
    if (entries.length === 0) return '-';
    return entries
      .map(
        ([k, v]) => `${k}: ${v !== null && typeof v === 'object' ? JSON.stringify(v) : String(v)}`,
      )
      .join(', ');
  } catch {
    return '-';
  }
}

interface AuditLogResponse {
  data: AuditLogEntry[];
  total: number;
  page: number;
  limit: number;
}

// Nilai harus SAMA PERSIS dengan AuditActionType di backend (shared/enums).
const ACTION_TYPES = [
  'login',
  'logout',
  'survey_create',
  'survey_update',
  'survey_delete',
  'survey_archive',
  'response_submit',
  'data_export',
  'user_create',
  'user_update',
  'user_delete',
  'user_password_reset',
  'role_change',
  'data_cleanup',
  'reward_redemption',
];

// Label tampilan saja; nilai filter dan data tetap memakai ACTION_TYPES.
const ACTION_LABELS: Record<string, string> = {
  login: 'Masuk',
  logout: 'Keluar',
  survey_create: 'Buat survei',
  survey_update: 'Ubah survei',
  survey_delete: 'Hapus survei',
  survey_archive: 'Arsipkan survei',
  response_submit: 'Kirim respons',
  data_export: 'Ekspor data',
  user_create: 'Buat pengguna',
  user_update: 'Ubah pengguna',
  user_delete: 'Hapus pengguna',
  user_password_reset: 'Reset kata sandi',
  role_change: 'Ubah peran',
  data_cleanup: 'Pembersihan data',
  reward_redemption: 'Penukaran poin',
};

function actionLabel(action: string): string {
  return ACTION_LABELS[action] ?? action.replace(/_/g, ' ');
}

const MODULES = [
  'auth',
  'survey',
  'response',
  'reward',
  'export',
  'user',
  'data-cleanup',
  'notification',
];

export function AuditLogPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportMessage, setExportMessage] = useState<PageMessage | null>(null);

  // Filters
  const [userFilter, setUserFilter] = useState('');
  const [actionTypeFilter, setActionTypeFilter] = useState('');
  const [moduleFilter, setModuleFilter] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [ipFilter, setIpFilter] = useState('');

  // Hapus/bersihkan log — hanya super_admin (endpoint juga dibatasi).
  const { user } = useAuthStore();
  const isSuperAdmin = user?.role === 'super_admin';
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [actionMsg, setActionMsg] = useState<PageMessage | null>(null);
  const { confirm, dialog } = useConfirm();
  // Dialog input hari untuk bersihkan log lama (pengganti window.prompt).
  const [purgeOpen, setPurgeOpen] = useState(false);
  const [purgeInput, setPurgeInput] = useState('90');
  const [purgeError, setPurgeError] = useState<string | null>(null);

  const limit = 20;

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('limit', String(limit));
      if (userFilter) params.set('userId', userFilter);
      if (actionTypeFilter) params.set('actionType', actionTypeFilter);
      if (moduleFilter) params.set('module', moduleFilter);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      if (ipFilter) params.set('ipAddress', ipFilter);

      const result = await api.get<AuditLogResponse>(`/audit?${params.toString()}`);
      setLogs(result.data);
      setTotal(result.total);
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr.message || 'Gagal memuat audit log');
    } finally {
      setLoading(false);
    }
  }, [page, userFilter, actionTypeFilter, moduleFilter, startDate, endDate, ipFilter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const handleExport = async () => {
    setExporting(true);
    setExportMessage(null);
    try {
      const filters: Record<string, string> = {};
      if (userFilter) filters.userId = userFilter;
      if (actionTypeFilter) filters.actionType = actionTypeFilter;
      if (moduleFilter) filters.module = moduleFilter;
      if (startDate) filters.startDate = startDate;
      if (endDate) filters.endDate = endDate;
      if (ipFilter) filters.ipAddress = ipFilter;

      const job = await api.post<{ id: string }>('/export/audit-log', filters);
      setExportMessage({ text: 'Memproses ekspor...', tone: 'neutral' });
      await pollAndDownloadExport(job.id);
      setExportMessage({ text: 'Berkas ekspor berhasil diunduh.', tone: 'success' });
    } catch (e) {
      setExportMessage({
        text: (e as Error).message || 'Gagal mengekspor audit log',
        tone: 'danger',
      });
    } finally {
      setExporting(false);
      setTimeout(() => setExportMessage(null), 5000);
    }
  };

  const handleClearFilters = () => {
    setUserFilter('');
    setActionTypeFilter('');
    setModuleFilter('');
    setStartDate('');
    setEndDate('');
    setIpFilter('');
    setPage(1);
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const allOnPageSelected = logs.length > 0 && logs.every((l) => selected.has(l.id));
  const toggleSelectAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) logs.forEach((l) => next.delete(l.id));
      else logs.forEach((l) => next.add(l.id));
      return next;
    });
  };

  const handleDeleteSelected = async () => {
    if (selected.size === 0) return;
    const ok = await confirm({
      title: 'Hapus log audit',
      message: `Hapus ${selected.size} log terpilih secara PERMANEN?`,
      confirmText: 'Hapus',
      danger: true,
    });
    if (!ok) return;
    setActionMsg(null);
    try {
      const res = await api.post<{ deleted: number }>('/audit/delete', { ids: [...selected] });
      setActionMsg({ text: `${res.deleted} log dihapus.`, tone: 'success' });
      setSelected(new Set());
      fetchLogs();
    } catch (e) {
      setActionMsg({ text: (e as Error).message || 'Gagal menghapus log.', tone: 'danger' });
    } finally {
      setTimeout(() => setActionMsg(null), 5000);
    }
  };

  const handlePurge = () => {
    setPurgeInput('90');
    setPurgeError(null);
    setPurgeOpen(true);
  };

  const submitPurge = async (e: FormEvent) => {
    e.preventDefault();
    const days = Math.floor(Number(purgeInput));
    if (!Number.isFinite(days) || days < 0) {
      setPurgeError('Jumlah hari tidak valid.');
      return;
    }
    setPurgeOpen(false);
    const ok = await confirm({
      title: 'Bersihkan log lama',
      message: `Hapus PERMANEN semua log lebih lama dari ${days} hari?`,
      confirmText: 'Hapus',
      danger: true,
    });
    if (!ok) return;
    setActionMsg(null);
    try {
      const res = await api.post<{ deleted: number }>('/audit/purge', { olderThanDays: days });
      setActionMsg({ text: `${res.deleted} log lama dihapus.`, tone: 'success' });
      setSelected(new Set());
      setPage(1);
      fetchLogs();
    } catch (e) {
      setActionMsg({ text: (e as Error).message || 'Gagal membersihkan log.', tone: 'danger' });
    } finally {
      setTimeout(() => setActionMsg(null), 5000);
    }
  };

  return (
    <div className="space-y-6">
      {dialog}
      {purgeOpen &&
        createPortal(
          <div
            className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4"
            onClick={() => setPurgeOpen(false)}
          >
            <form
              role="dialog"
              aria-modal="true"
              aria-labelledby="purgeDialogTitle"
              onSubmit={submitPurge}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Escape') setPurgeOpen(false);
              }}
              className="w-full max-w-sm rounded-xl bg-white p-5 text-left shadow-xl"
            >
              <h3 id="purgeDialogTitle" className="text-lg font-semibold text-gray-900">
                Bersihkan log lama
              </h3>
              <label htmlFor="purgeDays" className="mt-2 block text-sm text-gray-600">
                Hapus log yang lebih lama dari berapa hari?
              </label>
              <input
                id="purgeDays"
                type="number"
                min={0}
                autoFocus
                value={purgeInput}
                onChange={(e) => {
                  setPurgeInput(e.target.value);
                  setPurgeError(null);
                }}
                className={`${purgeError ? fieldInvalidCls : fieldCls} mt-3 tabular-nums`}
              />
              {purgeError && (
                <p role="alert" className="mt-1.5 text-sm text-danger-fg">
                  {purgeError}
                </p>
              )}
              <div className="mt-5 flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => setPurgeOpen(false)}>
                  Batal
                </Button>
                <Button type="submit">Lanjutkan</Button>
              </div>
            </form>
          </div>,
          document.body,
        )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Audit Log</h1>
        <div className="flex flex-wrap items-center gap-2">
          {isSuperAdmin && (
            <Button
              type="button"
              variant="secondary"
              onClick={handlePurge}
              title="Hapus log lama agar data tidak menumpuk"
            >
              Bersihkan log lama
            </Button>
          )}
          <Button type="button" variant="secondary" onClick={handleExport} disabled={exporting}>
            {exporting ? 'Mengekspor...' : 'Ekspor CSV'}
          </Button>
        </div>
      </div>

      {actionMsg && (
        <Notice tone={actionMsg.tone} role={actionMsg.tone === 'danger' ? 'alert' : 'status'}>
          {actionMsg.text}
        </Notice>
      )}

      {isSuperAdmin && selected.size > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm">
          <span className="font-medium tabular-nums text-gray-800">
            {selected.size} log dipilih
          </span>
          <Button type="button" variant="danger" size="sm" onClick={handleDeleteSelected}>
            Hapus terpilih
          </Button>
        </div>
      )}

      {/* Export message */}
      {exportMessage && (
        <Notice
          tone={exportMessage.tone}
          role={exportMessage.tone === 'danger' ? 'alert' : 'status'}
        >
          {exportMessage.text}
        </Notice>
      )}

      {/* Filter Panel */}
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3 xl:grid-cols-6">
          <div>
            <label htmlFor="userFilter" className={labelCls}>
              User ID/Nama
            </label>
            <input
              id="userFilter"
              type="text"
              placeholder="User ID..."
              value={userFilter}
              onChange={(e) => {
                setUserFilter(e.target.value);
                setPage(1);
              }}
              className={fieldCls}
            />
          </div>
          <div>
            <label htmlFor="actionType" className={labelCls}>
              Tipe Aksi
            </label>
            <select
              id="actionType"
              value={actionTypeFilter}
              onChange={(e) => {
                setActionTypeFilter(e.target.value);
                setPage(1);
              }}
              className={fieldCls}
            >
              <option value="">Semua</option>
              {ACTION_TYPES.map((type) => (
                <option key={type} value={type}>
                  {actionLabel(type)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="moduleFilter" className={labelCls}>
              Modul
            </label>
            <select
              id="moduleFilter"
              value={moduleFilter}
              onChange={(e) => {
                setModuleFilter(e.target.value);
                setPage(1);
              }}
              className={fieldCls}
            >
              <option value="">Semua</option>
              {MODULES.map((mod) => (
                <option key={mod} value={mod}>
                  {mod}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="startDate" className={labelCls}>
              Dari Tanggal
            </label>
            <input
              id="startDate"
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(1);
              }}
              className={fieldCls}
            />
          </div>
          <div>
            <label htmlFor="endDate" className={labelCls}>
              Sampai Tanggal
            </label>
            <input
              id="endDate"
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(1);
              }}
              className={fieldCls}
            />
          </div>
          <div>
            <label htmlFor="ipFilter" className={labelCls}>
              IP Address
            </label>
            <input
              id="ipFilter"
              type="text"
              placeholder="192.168..."
              value={ipFilter}
              onChange={(e) => {
                setIpFilter(e.target.value);
                setPage(1);
              }}
              className={fieldCls}
            />
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <Button type="button" variant="ghost" size="sm" onClick={handleClearFilters}>
            Reset Filter
          </Button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <Notice tone="danger" role="alert">
          {error}
        </Notice>
      )}

      {/* Table */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        {loading ? (
          <TableSkeleton rows={6} cols={5} />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr>
                  {isSuperAdmin && (
                    <th className={thCls}>
                      <RowCheckbox
                        label="Pilih semua di halaman ini"
                        checked={allOnPageSelected}
                        onChange={toggleSelectAll}
                      />
                    </th>
                  )}
                  <th className={thCls}>Waktu</th>
                  <th className={thCls}>User</th>
                  <th className={thCls}>Aksi</th>
                  <th className={thCls}>Modul</th>
                  <th className={thCls}>IP Address</th>
                  <th className={thCls}>Detail</th>
                </tr>
              </thead>
              <tbody className="[&>tr:last-child>td]:border-b-0">
                {logs.length === 0 ? (
                  <tr>
                    <td
                      colSpan={isSuperAdmin ? 7 : 6}
                      className={`${tdBase} py-8 text-center text-gray-600`}
                    >
                      Tidak ada log ditemukan
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      {isSuperAdmin && (
                        <td className={tdCls}>
                          <RowCheckbox
                            label="Pilih log"
                            checked={selected.has(log.id)}
                            onChange={() => toggleSelect(log.id)}
                          />
                        </td>
                      )}
                      <td className={`${tdCls} whitespace-nowrap tabular-nums`}>
                        {format(new Date(log.createdAt), 'dd/MM/yyyy HH:mm:ss')}
                      </td>
                      <td className={`${tdBase} py-3 text-gray-900`}>
                        <div className="flex flex-col">
                          <span className="font-medium">
                            {log.userName ||
                              log.userEmail ||
                              (log.userId ? 'Tanpa nama' : 'Sistem')}
                          </span>
                          <span className="text-xs text-gray-500">
                            {[
                              log.userRole ? (roleLabels[log.userRole] ?? log.userRole) : null,
                              // Tampilkan email bila ada nama (agar jelas akun mana);
                              // kalau hanya email yg tampil di atas, jangan diulang.
                              log.userName && log.userEmail ? log.userEmail : null,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                            {log.userExists === false && (
                              <span className="text-warning-fg"> · akun terhapus</span>
                            )}
                          </span>
                        </div>
                      </td>
                      <td
                        className={`${tdBase} whitespace-nowrap py-3 font-medium ${actionTone(log.actionType)}`}
                        title={log.actionType}
                      >
                        {actionLabel(log.actionType)}
                      </td>
                      <td className={tdCls}>{log.module}</td>
                      <td className={`${tdCls} font-mono`}>{log.ipAddress}</td>
                      <td
                        className={`${tdCls} max-w-xs truncate`}
                        title={formatDetails(log.details)}
                      >
                        {formatDetails(log.details)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        <Pagination page={page} limit={limit} total={total} onPageChange={setPage} />
      </div>
    </div>
  );
}
