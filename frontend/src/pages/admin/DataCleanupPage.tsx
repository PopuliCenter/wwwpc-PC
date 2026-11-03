import { useState, useEffect, useCallback } from 'react';
import { api } from '@/services/api';
import { format } from 'date-fns';
import { Button } from '@/components/common/Button';
import { thBaseCls, tdBaseCls } from '@/components/common/tableStyles';
import { Card } from '@/components/common/Card';
import { useConfirm } from '@/components/common/ConfirmDialog';
import { Notice } from '@/components/common/Notice';
import { Skeleton, TableSkeleton } from '@/components/common/Skeleton';
import { fieldCls } from '@/components/common/fieldStyles';

// Tabel gaya laporan: garis tebal navy di bawah kepala, garis tipis antar baris.
const thBase = `${thBaseCls} whitespace-nowrap py-2.5`;
const thCls = `${thBase} text-left`;
const thNumCls = `${thBase} text-right`;
const tdBase = `${tdBaseCls} text-sm`;
const tdCls = `${tdBase} py-3 text-gray-600`;
const tdNumCls = `${tdBase} py-3 text-right tabular-nums text-gray-600`;
const labelCls = 'mb-1 block text-sm font-medium text-gray-700';

/** Pesan hasil aksi; warnanya dari flag ini, bukan dari isi teks pesan. */
interface ResultMessage {
  text: string;
  ok: boolean;
}

function ResultNotice({ message }: { message: ResultMessage }) {
  return (
    <Notice tone={message.ok ? 'success' : 'danger'} role={message.ok ? 'status' : 'alert'}>
      {message.text}
    </Notice>
  );
}

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
  const [confirmMessage, setConfirmMessage] = useState<ResultMessage | null>(null);

  // Archive state
  const [archiving, setArchiving] = useState<string | null>(null);
  const [archiveMessage, setArchiveMessage] = useState<ResultMessage | null>(null);

  const fetchCandidates = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.get<CleanupCandidate[]>(
        '/data-cleanup/candidates?exportStatus=exported_only',
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
      setConfirmMessage({ text: 'Data berhasil dihapus', ok: true });
      setDeletionResult(null);
      setConfirmToken('');
      setConfirmRequestId('');
      fetchCandidates();
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setConfirmMessage({ text: apiErr.message || 'Gagal mengkonfirmasi penghapusan', ok: false });
    } finally {
      setConfirming(false);
    }
  };

  const handleArchive = async (surveyId: string) => {
    setArchiving(surveyId);
    setArchiveMessage(null);
    try {
      await api.post(`/data-cleanup/archive/${surveyId}`);
      setArchiveMessage({ text: 'Survei berhasil diarsipkan', ok: true });
      fetchCandidates();
    } catch {
      setArchiveMessage({ text: 'Gagal mengarsipkan survei', ok: false });
    } finally {
      setArchiving(null);
      setTimeout(() => setArchiveMessage(null), 3000);
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">Kandidat Penghapusan Data</h2>

      {error && (
        <Notice tone="danger" role="alert">
          {error}
        </Notice>
      )}

      {archiveMessage && <ResultNotice message={archiveMessage} />}

      {loading ? (
        <TableSkeleton rows={3} cols={5} />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr>
                <th className={thCls}>Survei</th>
                <th className={thNumCls}>Total Respons</th>
                <th className={thNumCls}>Sudah Diekspor</th>
                <th className={thNumCls}>Dapat Dihapus</th>
                <th className={thCls}>Ekspor Terakhir</th>
                <th className={thNumCls}>Aksi</th>
              </tr>
            </thead>
            <tbody className="[&>tr:last-child>td]:border-b-0">
              {candidates.length === 0 ? (
                <tr>
                  <td colSpan={6} className={`${tdBase} py-8 text-center text-gray-600`}>
                    Tidak ada data yang dapat dihapus
                  </td>
                </tr>
              ) : (
                candidates.map((c) => (
                  <tr key={c.surveyId} className="hover:bg-gray-50">
                    <td className={`${tdBase} py-3 text-gray-900`}>{c.surveyTitle}</td>
                    <td className={tdNumCls}>{c.totalResponses}</td>
                    <td className={tdNumCls}>{c.exportedResponses}</td>
                    <td
                      className={`${tdBase} py-3 text-right font-medium tabular-nums text-danger-fg`}
                    >
                      {c.deletableCount}
                    </td>
                    <td className={`${tdCls} whitespace-nowrap tabular-nums`}>
                      {c.lastExportDate ? format(new Date(c.lastExportDate), 'dd/MM/yyyy') : '-'}
                    </td>
                    <td className={`${tdBase} py-1.5 text-right`}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleArchive(c.surveyId)}
                        disabled={archiving === c.surveyId}
                      >
                        {archiving === c.surveyId ? 'Mengarsipkan...' : 'Arsipkan'}
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Request Deletion Form */}
      <div className="mt-4 rounded-lg border border-gray-200 p-4">
        <h3 className="mb-3 text-sm font-semibold text-gray-900">Ajukan Penghapusan Data</h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          <div>
            <label htmlFor="deleteSurvey" className={labelCls}>
              Survei
            </label>
            <select
              id="deleteSurvey"
              value={selectedSurvey}
              onChange={(e) => setSelectedSurvey(e.target.value)}
              className={fieldCls}
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
            <label htmlFor="dateFrom" className={labelCls}>
              Dari Tanggal
            </label>
            <input
              id="dateFrom"
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className={fieldCls}
            />
          </div>
          <div>
            <label htmlFor="dateTo" className={labelCls}>
              Sampai Tanggal
            </label>
            <input
              id="dateTo"
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className={fieldCls}
            />
          </div>
          <div className="flex items-end">
            <Button
              type="button"
              variant="danger"
              onClick={handleRequestDeletion}
              disabled={!selectedSurvey || requesting}
              className="w-full"
            >
              {requesting ? 'Memproses...' : 'Ajukan Hapus'}
            </Button>
          </div>
        </div>
      </div>

      {/* Deletion Result & Confirmation */}
      {deletionResult && (
        <Notice tone="danger" title="Konfirmasi Penghapusan">
          <p className="mb-1">
            Data yang akan dihapus:{' '}
            <strong className="font-semibold tabular-nums">{deletionResult.affectedCount}</strong>{' '}
            respons
          </p>
          <p className="mb-3">
            Token konfirmasi:{' '}
            <code className="break-all rounded-sm border border-danger-border bg-white px-1.5 py-0.5 font-mono text-xs">
              {deletionResult.confirmationToken}
            </code>
          </p>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="flex-1">
              <label htmlFor="confirmToken" className={labelCls}>
                Masukkan token konfirmasi
              </label>
              <input
                id="confirmToken"
                type="text"
                value={confirmToken}
                onChange={(e) => setConfirmToken(e.target.value)}
                placeholder="Masukkan token..."
                className={fieldCls}
              />
            </div>
            <Button
              type="button"
              variant="danger"
              onClick={handleConfirmDeletion}
              disabled={!confirmToken || confirming}
            >
              {confirming ? 'Menghapus...' : 'Konfirmasi Hapus'}
            </Button>
          </div>
        </Notice>
      )}

      {confirmMessage && <ResultNotice message={confirmMessage} />}
    </div>
  );
}

// GDPR Deletion Section
function GdprDeletionSection() {
  const [respondentId, setRespondentId] = useState('');
  const [superAdminApproval, setSuperAdminApproval] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<ResultMessage | null>(null);
  const { confirm, dialog } = useConfirm();

  const handleGdprDelete = async () => {
    const ok = await confirm({
      title: 'Konfirmasi Penghapusan GDPR',
      message: `Anda akan menghapus SEMUA data personal untuk responden ${respondentId}. Tindakan ini TIDAK DAPAT dibatalkan. Lanjutkan?`,
      confirmText: 'Ya, Hapus Permanen',
      danger: true,
    });
    if (!ok) return;
    setLoading(true);
    setMessage(null);
    try {
      await api.post(`/data-cleanup/gdpr/${respondentId}`, {
        superAdminApproval,
      });
      setMessage({ text: 'Data personal berhasil dihapus sesuai GDPR', ok: true });
      setRespondentId('');
      setSuperAdminApproval('');
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setMessage({ text: apiErr.message || 'Gagal menghapus data', ok: false });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {dialog}
      <h2 className="text-lg font-semibold text-gray-900">Penghapusan Data GDPR</h2>

      <Notice tone="warning">
        Penghapusan GDPR bersifat{' '}
        <strong className="font-semibold">permanen dan tidak dapat dibatalkan</strong>. Semua data
        personal (nama, email, telepon, lokasi) akan dihapus secara permanen.
      </Notice>

      {message && <ResultNotice message={message} />}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <div>
          <label htmlFor="respondentId" className={labelCls}>
            ID Responden
          </label>
          <input
            id="respondentId"
            type="text"
            value={respondentId}
            onChange={(e) => setRespondentId(e.target.value)}
            placeholder="ID responden..."
            className={fieldCls}
          />
        </div>
        <div>
          <label htmlFor="superAdminApproval" className={labelCls}>
            Persetujuan Super Admin
          </label>
          <input
            id="superAdminApproval"
            type="text"
            value={superAdminApproval}
            onChange={(e) => setSuperAdminApproval(e.target.value)}
            placeholder="Kode persetujuan..."
            className={fieldCls}
          />
        </div>
        <div className="flex items-end">
          <Button
            type="button"
            variant="danger"
            onClick={handleGdprDelete}
            disabled={!respondentId || !superAdminApproval || loading}
            className="w-full"
          >
            {loading ? 'Memproses...' : 'Hapus Data GDPR'}
          </Button>
        </div>
      </div>
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
  const [message, setMessage] = useState<ResultMessage | null>(null);

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
      setMessage({ text: 'Konfigurasi berhasil disimpan', ok: true });
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setMessage({ text: apiErr.message || 'Gagal menyimpan konfigurasi', ok: false });
    } finally {
      setSaving(false);
      setTimeout(() => setMessage(null), 3000);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-6 w-2/3" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Skeleton className="h-11 w-full rounded-lg" />
          <Skeleton className="h-11 w-full rounded-lg" />
          <Skeleton className="h-11 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-gray-900">Konfigurasi Pembersihan Terjadwal</h2>

      {message && <ResultNotice message={message} />}

      <div className="grid grid-cols-1 items-end gap-4 md:grid-cols-3">
        <div>
          <label className="flex min-h-11 cursor-pointer items-center gap-2 lg:min-h-0">
            <input
              type="checkbox"
              checked={config.enabled}
              onChange={(e) => setConfig({ ...config, enabled: e.target.checked })}
              className="h-4 w-4 accent-primary-600"
            />
            <span className="text-sm font-medium text-gray-700">
              Aktifkan Pembersihan Terjadwal
            </span>
          </label>
          <p className="mt-1 text-xs text-gray-600">
            Otomatis hapus data yang sudah diekspor dan melewati masa simpan
          </p>
        </div>
        <div>
          <label htmlFor="retentionDays" className={labelCls}>
            Masa simpan (hari)
          </label>
          <input
            id="retentionDays"
            type="number"
            min={30}
            max={3650}
            value={config.retentionDays}
            onChange={(e) => setConfig({ ...config, retentionDays: Number(e.target.value) })}
            className={`${fieldCls} tabular-nums`}
          />
        </div>
        <div>
          <label htmlFor="cronExpression" className={labelCls}>
            Jadwal (Cron)
          </label>
          <input
            id="cronExpression"
            type="text"
            value={config.cronExpression}
            onChange={(e) => setConfig({ ...config, cronExpression: e.target.value })}
            placeholder="0 2 * * *"
            className={`${fieldCls} font-mono`}
          />
          <p className="mt-1 text-xs text-gray-600">Contoh: 0 2 * * * (setiap hari jam 02:00)</p>
        </div>
      </div>

      <div className="flex justify-end">
        <Button type="button" onClick={handleSave} disabled={saving}>
          {saving ? 'Menyimpan...' : 'Simpan Konfigurasi'}
        </Button>
      </div>
    </div>
  );
}

export function DataCleanupPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Pembersihan Data</h1>

      {/* Cleanup Candidates */}
      <Card>
        <CleanupCandidatesSection />
      </Card>

      {/* GDPR Deletion */}
      <Card>
        <GdprDeletionSection />
      </Card>

      {/* Scheduled Purge */}
      <Card>
        <ScheduledPurgeSection />
      </Card>
    </div>
  );
}
