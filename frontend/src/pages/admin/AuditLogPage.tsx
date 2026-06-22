import { useState, useEffect, useCallback } from 'react';
import { api } from '@/services/api';
import { useAuthStore } from '@/stores/auth.store';
import { pollAndDownloadExport } from '@/utils/exportDownload';
import { format } from 'date-fns';

// Types
interface AuditLogEntry {
  id: string;
  userId: string;
  userName?: string | null;
  userRole?: string | null;
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

/** Warna badge per kategori aksi (hijau=buat, biru=ubah, merah=hapus, dst). */
function actionTone(action: string): string {
  if (action.includes('delete') || action.includes('cleanup')) return 'bg-red-50 text-red-700';
  if (action.includes('create')) return 'bg-emerald-50 text-emerald-700';
  if (action.includes('update') || action.includes('change')) return 'bg-blue-50 text-blue-700';
  if (action.includes('export')) return 'bg-indigo-50 text-indigo-700';
  if (action.includes('redemption') || action.includes('reward')) return 'bg-amber-50 text-amber-700';
  return 'bg-gray-100 text-gray-600';
}

/** Render details (objek JSONB / string) jadi teks aman untuk React. */
function formatDetails(details?: Record<string, unknown> | string | null): string {
  if (!details) return '-';
  if (typeof details === 'string') return details;
  try {
    const entries = Object.entries(details);
    if (entries.length === 0) return '-';
    return entries
      .map(([k, v]) => `${k}: ${v !== null && typeof v === 'object' ? JSON.stringify(v) : String(v)}`)
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
  const [exportMessage, setExportMessage] = useState<string | null>(null);

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
  const [actionMsg, setActionMsg] = useState<string | null>(null);

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

  const totalPages = Math.ceil(total / limit);

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
      setExportMessage('Memproses export...');
      await pollAndDownloadExport(job.id);
      setExportMessage('File export berhasil diunduh.');
    } catch (e) {
      setExportMessage((e as Error).message || 'Gagal mengexport audit log');
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
    if (!window.confirm(`Hapus ${selected.size} log terpilih secara PERMANEN?`)) return;
    setActionMsg(null);
    try {
      const res = await api.post<{ deleted: number }>('/audit/delete', { ids: [...selected] });
      setActionMsg(`${res.deleted} log dihapus.`);
      setSelected(new Set());
      fetchLogs();
    } catch (e) {
      setActionMsg((e as Error).message || 'Gagal menghapus log.');
    } finally {
      setTimeout(() => setActionMsg(null), 5000);
    }
  };

  const handlePurge = async () => {
    const input = window.prompt('Hapus log yang LEBIH LAMA dari berapa hari? (mis. 90)', '90');
    if (input === null) return;
    const days = Math.floor(Number(input));
    if (!Number.isFinite(days) || days < 0) {
      setActionMsg('Jumlah hari tidak valid.');
      return;
    }
    if (!window.confirm(`Hapus PERMANEN semua log lebih lama dari ${days} hari?`)) return;
    setActionMsg(null);
    try {
      const res = await api.post<{ deleted: number }>('/audit/purge', { olderThanDays: days });
      setActionMsg(`${res.deleted} log lama dihapus.`);
      setSelected(new Set());
      setPage(1);
      fetchLogs();
    } catch (e) {
      setActionMsg((e as Error).message || 'Gagal membersihkan log.');
    } finally {
      setTimeout(() => setActionMsg(null), 5000);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-gray-900">Audit Log</h1>
        <div className="flex items-center gap-2">
          {isSuperAdmin && (
            <button
              onClick={handlePurge}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              title="Hapus log lama agar data tidak menumpuk"
            >
              Bersihkan log lama
            </button>
          )}
          <button
            onClick={handleExport}
            disabled={exporting}
            className="rounded-md bg-green-600 px-4 py-2 text-sm text-white hover:bg-green-700 disabled:opacity-50"
          >
            {exporting ? 'Mengexport...' : 'Export CSV'}
          </button>
        </div>
      </div>

      {actionMsg && (
        <div className="rounded-md border border-primary-200 bg-primary-50 p-3 text-sm text-primary-800">
          {actionMsg}
        </div>
      )}

      {isSuperAdmin && selected.size > 0 && (
        <div className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-4 py-2 text-sm">
          <span className="font-medium text-red-700">{selected.size} log dipilih</span>
          <button
            onClick={handleDeleteSelected}
            className="rounded-md bg-red-600 px-3 py-1.5 font-medium text-white hover:bg-red-700"
          >
            Hapus terpilih
          </button>
        </div>
      )}

      {/* Export message */}
      {exportMessage && (
        <div className="bg-primary-50 border border-primary-200 rounded-md p-3">
          <p className="text-sm text-primary-800">{exportMessage}</p>
        </div>
      )}

      {/* Filter Panel */}
      <div className="bg-white rounded-2xl border border-gray-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div>
            <label htmlFor="userFilter" className="block text-sm font-medium text-gray-700 mb-1">
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
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
            />
          </div>
          <div>
            <label htmlFor="actionType" className="block text-sm font-medium text-gray-700 mb-1">
              Tipe Aksi
            </label>
            <select
              id="actionType"
              value={actionTypeFilter}
              onChange={(e) => {
                setActionTypeFilter(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
            >
              <option value="">Semua</option>
              {ACTION_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="moduleFilter" className="block text-sm font-medium text-gray-700 mb-1">
              Modul
            </label>
            <select
              id="moduleFilter"
              value={moduleFilter}
              onChange={(e) => {
                setModuleFilter(e.target.value);
                setPage(1);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
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
            <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-1">
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
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
            />
          </div>
          <div>
            <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 mb-1">
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
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
            />
          </div>
          <div>
            <label htmlFor="ipFilter" className="block text-sm font-medium text-gray-700 mb-1">
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
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500 text-sm"
            />
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <button
            onClick={handleClearFilters}
            className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
          >
            Reset Filter
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Memuat data...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  {isSuperAdmin && (
                    <th className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={allOnPageSelected}
                        onChange={toggleSelectAll}
                        aria-label="Pilih semua di halaman ini"
                      />
                    </th>
                  )}
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Waktu
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    User
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Aksi
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Modul
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    IP Address
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Detail
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={isSuperAdmin ? 7 : 6} className="px-4 py-8 text-center text-gray-500">
                      Tidak ada log ditemukan
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50">
                      {isSuperAdmin && (
                        <td className="px-4 py-3">
                          <input
                            type="checkbox"
                            checked={selected.has(log.id)}
                            onChange={() => toggleSelect(log.id)}
                            aria-label="Pilih log"
                          />
                        </td>
                      )}
                      <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                        {format(new Date(log.createdAt), 'dd/MM/yyyy HH:mm:ss')}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-900">
                        <div className="flex flex-col">
                          <span className="font-medium">{log.userName || 'Pengguna'}</span>
                          {log.userRole && (
                            <span className="text-xs text-gray-400">
                              {roleLabels[log.userRole] ?? log.userRole}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <span className={`inline-flex rounded-full px-2 py-1 text-xs font-medium ${actionTone(log.actionType)}`}>
                          {log.actionType.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">{log.module}</td>
                      <td className="px-4 py-3 text-sm text-gray-600 font-mono text-xs">
                        {log.ipAddress}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600 max-w-xs truncate" title={formatDetails(log.details)}>
                        {formatDetails(log.details)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
            <p className="text-sm text-gray-600">
              Menampilkan {(page - 1) * limit + 1}-{Math.min(page * limit, total)} dari {total}
            </p>
            <div className="flex gap-1">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Prev
              </button>
              {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                const startPage = Math.max(1, Math.min(page - 2, totalPages - 4));
                const pageNum = startPage + i;
                if (pageNum > totalPages) return null;
                return (
                  <button
                    key={pageNum}
                    onClick={() => setPage(pageNum)}
                    className={`px-3 py-1 text-sm border rounded-md ${
                      page === pageNum
                        ? 'bg-primary-600 text-white border-primary-600'
                        : 'border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
