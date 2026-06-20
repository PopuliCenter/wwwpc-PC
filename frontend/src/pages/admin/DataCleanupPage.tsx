import { useState, useEffect, useCallback } from 'react';
import { api } from '@/services/api';
import { format } from 'date-fns';

// Types
interface CleanupCandidate {
  surveyId: string;
  surveyTitle: string;
  totalResponses: number;
  exportedResponses: number;
  deletableCount: number;
  lastExportDate?: string | null;
}

interface DeletionRequestResult {
  requestId: string;
  confirmationToken: string;
  affectedCount: number;
}

interface PurgeConfig {
  enabled: boolean;
  retentionDays: number;
  cronExpression: string;
}

// Confirmation Modal
function ConfirmModal({
  open,
  onClose,
  title,
  message,
  confirmLabel,
  onConfirm,
  loading,
  variant,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => void;
  loading: boolean;
  variant?: 'danger' | 'warning';
}) {
  if (!open) return null;

  const btnClass =
    variant === 'danger'
      ? 'bg-red-600 hover:bg-red-700 text-white'
      : 'bg-yellow-600 hover:bg-yellow-700 text-white';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
        <p className="text-sm text-gray-600 mb-4">{message}</p>
        <div className="flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
          >
            Batal
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 px-4 py-2 rounded-md disabled:opacity-50 ${btnClass}`}
          >
            {loading ? 'Memproses...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// Cleanup Candidates Section
function CleanupCandidatesSection() {
  const [candidates, setCandidates] = useState<CleanupCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Deletion request state
  const [selectedSurvey, setSelectedSurvey] = useState<string>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [requesting, setRequesting] = useState(false);
  const [deletionResult, setDeletionResult] = useState<DeletionRequestResult | null>(null);

  // Confirm deletion state
  const [confirmToken, setConfirmToken] = useState('');
  const [confirmRequestId, setConfirmRequestId] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [confirmMessage, setConfirmMessage] = useState<string | null>(null);

  // Archive state
  const [archiving, setArchiving] = useState<string | null>(null);
  const [archiveMessage, setArchiveMessage] = useState<string | null>(null);

  const fetchCandidates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.get<CleanupCandidate[]>(
        '/data-cleanup/candidates?exportStatus=exported_only'
      );
      setCandidates(result);
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr.message || 'Gagal memuat data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCandidates();
  }, [fetchCandidates]);

  const handleRequestDeletion = async () => {
    if (!selectedSurvey) return;
    setRequesting(true);
    try {
      const result = await api.post<DeletionRequestResult>('/data-cleanup/request', {
        surveyId: selectedSurvey,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      });
      setDeletionResult(result);
      setConfirmRequestId(result.requestId);
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr.message || 'Gagal membuat permintaan penghapusan');
    } finally {
      setRequesting(false);
    }
  };

  const handleConfirmDeletion = async () => {
    if (!confirmToken || !confirmRequestId) return;
    setConfirming(true);
    setConfirmMessage(null);
    try {
      await api.post(`/data-cleanup/confirm/${confirmRequestId}`, {
        confirmationToken: confirmToken,
      });
      setConfirmMessage('Data berhasil dihapus');
      setDeletionResult(null);
      setConfirmToken('');
      setConfirmRequestId('');
      fetchCandidates();
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setConfirmMessage(apiErr.message || 'Gagal mengkonfirmasi penghapusan');
    } finally {
      setConfirming(false);
    }
  };

  const handleArchive = async (surveyId: string) => {
    setArchiving(surveyId);
    setArchiveMessage(null);
    try {
      await api.post(`/data-cleanup/archive/${surveyId}`);
      setArchiveMessage('Survei berhasil diarsipkan');
      fetchCandidates();
    } catch {
      setArchiveMessage('Gagal mengarsipkan survei');
    } finally {
      setArchiving(null);
      setTimeout(() => setArchiveMessage(null), 3000);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">Kandidat Penghapusan Data</h2>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {archiveMessage && (
        <div className="bg-primary-50 border border-primary-200 rounded-md p-3">
          <p className="text-sm text-primary-800">{archiveMessage}</p>
        </div>
      )}

      {loading ? (
        <div className="p-8 text-center text-gray-500">Memuat data...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Survei
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Total Respons
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Sudah Export
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Dapat Dihapus
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Export Terakhir
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                  Aksi
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {candidates.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    Tidak ada data yang dapat dihapus
                  </td>
                </tr>
              ) : (
                candidates.map((c) => (
                  <tr key={c.surveyId} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">{c.surveyTitle}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{c.totalResponses}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{c.exportedResponses}</td>
                    <td className="px-4 py-3 text-sm font-medium text-orange-600">
                      {c.deletableCount}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {c.lastExportDate
                        ? format(new Date(c.lastExportDate), 'dd/MM/yyyy')
                        : '-'}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <button
                        onClick={() => handleArchive(c.surveyId)}
                        disabled={archiving === c.surveyId}
                        className="text-primary-600 hover:text-primary-800 text-xs font-medium disabled:opacity-50"
                      >
                        {archiving === c.surveyId ? 'Mengarsipkan...' : 'Arsipkan'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Request Deletion Form */}
      <div className="border border-gray-200 rounded-lg p-4 mt-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Ajukan Penghapusan Data</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label htmlFor="deleteSurvey" className="block text-xs font-medium text-gray-700 mb-1">
              Survei
            </label>
            <select
              id="deleteSurvey"
              value={selectedSurvey}
              onChange={(e) => setSelectedSurvey(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="">Pilih survei...</option>
              {candidates.map((c) => (
                <option key={c.surveyId} value={c.surveyId}>
                  {c.surveyTitle}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="dateFrom" className="block text-xs font-medium text-gray-700 mb-1">
              Dari Tanggal
            </label>
            <input
              id="dateFrom"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label htmlFor="dateTo" className="block text-xs font-medium text-gray-700 mb-1">
              Sampai Tanggal
            </label>
            <input
              id="dateTo"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div className="flex items-end">
            <button
              onClick={handleRequestDeletion}
              disabled={!selectedSurvey || requesting}
              className="w-full px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700 disabled:opacity-50 text-sm"
            >
              {requesting ? 'Memproses...' : 'Ajukan Hapus'}
            </button>
          </div>
        </div>
      </div>

      {/* Deletion Result & Confirmation */}
      {deletionResult && (
        <div className="border border-red-200 bg-red-50 rounded-lg p-4">
          <h3 className="text-sm font-semibold text-red-900 mb-2">Konfirmasi Penghapusan</h3>
          <p className="text-sm text-red-700 mb-1">
            Data yang akan dihapus: <strong>{deletionResult.affectedCount}</strong> respons
          </p>
          <p className="text-sm text-red-700 mb-3">
            Token konfirmasi:{' '}
            <code className="bg-red-100 px-2 py-0.5 rounded font-mono text-xs">
              {deletionResult.confirmationToken}
            </code>
          </p>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <label htmlFor="confirmToken" className="block text-xs font-medium text-red-800 mb-1">
                Masukkan token konfirmasi
              </label>
              <input
                id="confirmToken"
                type="text"
                value={confirmToken}
                onChange={(e) => setConfirmToken(e.target.value)}
                placeholder="Masukkan token..."
                className="w-full px-3 py-2 border border-red-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-red-500"
              />
            </div>
            <button
              onClick={handleConfirmDeletion}
              disabled={!confirmToken || confirming}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 text-sm font-medium"
            >
              {confirming ? 'Menghapus...' : 'Konfirmasi Hapus'}
            </button>
          </div>
        </div>
      )}

      {confirmMessage && (
        <div
          className={`rounded-md p-3 ${
            confirmMessage.includes('berhasil')
              ? 'bg-green-50 border border-green-200'
              : 'bg-red-50 border border-red-200'
          }`}
        >
          <p
            className={`text-sm ${
              confirmMessage.includes('berhasil') ? 'text-green-800' : 'text-red-700'
            }`}
          >
            {confirmMessage}
          </p>
        </div>
      )}
    </div>
  );
}

// GDPR Deletion Section
function GdprDeletionSection() {
  const [respondentId, setRespondentId] = useState('');
  const [superAdminApproval, setSuperAdminApproval] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleGdprDelete = async () => {
    setLoading(true);
    setMessage(null);
    try {
      await api.post(`/data-cleanup/gdpr/${respondentId}`, {
        superAdminApproval,
      });
      setMessage('Data personal berhasil dihapus sesuai GDPR');
      setRespondentId('');
      setSuperAdminApproval('');
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setMessage(apiErr.message || 'Gagal menghapus data');
    } finally {
      setLoading(false);
      setShowConfirm(false);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">Penghapusan Data GDPR</h2>

      <div className="bg-yellow-50 border border-yellow-200 rounded-md p-3">
        <p className="text-sm text-yellow-800">
          ⚠️ Penghapusan GDPR bersifat <strong>permanen dan tidak dapat dibatalkan</strong>. Semua
          data personal (nama, email, telepon, lokasi) akan dihapus secara permanen.
        </p>
      </div>

      {message && (
        <div
          className={`rounded-md p-3 ${
            message.includes('berhasil')
              ? 'bg-green-50 border border-green-200'
              : 'bg-red-50 border border-red-200'
          }`}
        >
          <p
            className={`text-sm ${
              message.includes('berhasil') ? 'text-green-800' : 'text-red-700'
            }`}
          >
            {message}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <label htmlFor="respondentId" className="block text-sm font-medium text-gray-700 mb-1">
            Respondent ID
          </label>
          <input
            id="respondentId"
            type="text"
            value={respondentId}
            onChange={(e) => setRespondentId(e.target.value)}
            placeholder="ID responden..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <div>
          <label
            htmlFor="superAdminApproval"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Approval Super Admin
          </label>
          <input
            id="superAdminApproval"
            type="text"
            value={superAdminApproval}
            onChange={(e) => setSuperAdminApproval(e.target.value)}
            placeholder="Kode approval..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <div className="flex items-end">
          <button
            onClick={() => setShowConfirm(true)}
            disabled={!respondentId || !superAdminApproval}
            className="w-full px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50 text-sm font-medium"
          >
            Hapus Data GDPR
          </button>
        </div>
      </div>

      <ConfirmModal
        open={showConfirm}
        onClose={() => setShowConfirm(false)}
        title="Konfirmasi Penghapusan GDPR"
        message={`Anda akan menghapus SEMUA data personal untuk responden ${respondentId}. Tindakan ini TIDAK DAPAT dibatalkan. Lanjutkan?`}
        confirmLabel="Ya, Hapus Permanen"
        onConfirm={handleGdprDelete}
        loading={loading}
        variant="danger"
      />
    </div>
  );
}

// Scheduled Purge Configuration Section
function ScheduledPurgeSection() {
  const [config, setConfig] = useState<PurgeConfig>({
    enabled: false,
    retentionDays: 365,
    cronExpression: '0 2 * * *',
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const fetchConfig = async () => {
      setLoading(true);
      try {
        const result = await api.get<PurgeConfig>('/data-cleanup/purge-config');
        setConfig(result);
      } catch {
        // Use defaults if not configured yet
      } finally {
        setLoading(false);
      }
    };
    fetchConfig();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await api.post('/data-cleanup/purge-config', config);
      setMessage('Konfigurasi berhasil disimpan');
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setMessage(apiErr.message || 'Gagal menyimpan konfigurasi');
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  if (loading) {
    return <div className="p-4 text-center text-gray-500">Memuat konfigurasi...</div>;
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">Konfigurasi Scheduled Purge</h2>

      {message && (
        <div
          className={`rounded-md p-3 ${
            message.includes('berhasil')
              ? 'bg-green-50 border border-green-200'
              : 'bg-red-50 border border-red-200'
          }`}
        >
          <p
            className={`text-sm ${
              message.includes('berhasil') ? 'text-green-800' : 'text-red-700'
            }`}
          >
            {message}
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
        <div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
              className="w-4 h-4 text-primary-600 border-gray-300 rounded focus:ring-primary-500"
            />
            <span className="text-sm font-medium text-gray-700">Aktifkan Scheduled Purge</span>
          </label>
          <p className="text-xs text-gray-500 mt-1">
            Otomatis hapus data exported yang melebihi retention period
          </p>
        </div>
        <div>
          <label htmlFor="retentionDays" className="block text-sm font-medium text-gray-700 mb-1">
            Retention (hari)
          </label>
          <input
            id="retentionDays"
            type="number"
            min={30}
            max={3650}
            value={config.retentionDays}
            onChange={(e) => setConfig({ ...config, retentionDays: Number(e.target.value) })}
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
        </div>
        <div>
          <label htmlFor="cronExpression" className="block text-sm font-medium text-gray-700 mb-1">
            Jadwal (Cron)
          </label>
          <input
            id="cronExpression"
            type="text"
            value={config.cronExpression}
            onChange={(e) => setConfig({ ...config, cronExpression: e.target.value })}
            placeholder="0 2 * * *"
            className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-primary-500"
          />
          <p className="text-xs text-gray-500 mt-1">Contoh: 0 2 * * * (setiap hari jam 02:00)</p>
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={handleSave}
          disabled={saving}
          className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 text-sm"
        >
          {saving ? 'Menyimpan...' : 'Simpan Konfigurasi'}
        </button>
      </div>
    </div>
  );
}

export function DataCleanupPage() {
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold text-gray-900">Data Cleanup</h1>

      {/* Cleanup Candidates */}
      <div className="bg-white rounded-lg shadow p-6">
        <CleanupCandidatesSection />
      </div>

      {/* GDPR Deletion */}
      <div className="bg-white rounded-lg shadow p-6">
        <GdprDeletionSection />
      </div>

      {/* Scheduled Purge */}
      <div className="bg-white rounded-lg shadow p-6">
        <ScheduledPurgeSection />
      </div>
    </div>
  );
}
