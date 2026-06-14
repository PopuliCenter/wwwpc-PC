import { useState, useEffect, useCallback } from 'react';
import { api } from '@/services/api';
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Audit Log</h1>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50 text-sm"
        >
          {exporting ? 'Mengexport...' : 'Export CSV'}
        </button>
      </div>

      {/* Export message */}
      {exportMessage && (
        <div className="bg-primary-50 border border-primary-200 rounded-md p-3">
          <p className="text-sm text-primary-800">{exportMessage}</p>
        </div>
      )}

      {/* Filter Panel */}
      <div className="bg-white rounded-lg shadow p-4">
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
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Memuat data...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
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
                    <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                      Tidak ada log ditemukan
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => (
                    <tr key={log.id} className="hover:bg-gray-50">
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
                        <span className="inline-flex px-2 py-1 text-xs font-medium rounded-full bg-gray-100 text-gray-800">
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
