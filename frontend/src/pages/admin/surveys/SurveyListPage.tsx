import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Pencil,
  Copy,
  PlayCircle,
  PauseCircle,
  Archive,
  Trash2,
  ClipboardList,
  BarChart3,
  Send,
  Users,
  Download,
  Upload,
} from 'lucide-react';
import { api } from '@/services/api';
import { Card } from '@/components/common/Card';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import { TargetedInviteModal } from './TargetedInviteModal';
import { useConfirm } from '@/components/common/ConfirmDialog';
import { showAppNotice } from '@/stores/notification.store';
import { exportQuestions, parseQuestionsFile } from './questionImportExport';
import { setPendingImport } from './questionImportHandoff';
import { SurveyEditorHelp } from './SurveyEditorHelp';
import { format } from 'date-fns';

interface Survey {
  id: string;
  title: string;
  status: 'draft' | 'active' | 'inactive' | 'archived';
  rewardMode: 'automatic' | 'manual';
  surveyType?: 'nasional' | 'daerah' | 'lainnya';
  category?: string | null;
  createdAt: string;
  startDate?: string;
  endDate?: string;
}

const surveyTypeBadge: Record<'nasional' | 'daerah' | 'lainnya', { label: string; cls: string }> = {
  nasional: { label: 'Nasional', cls: 'bg-primary-100 text-primary-700' },
  daerah: { label: 'Daerah', cls: 'bg-emerald-100 text-emerald-700' },
  lainnya: { label: 'Lainnya', cls: 'bg-gray-100 text-gray-600' },
};

const statusTone: Record<Survey['status'], 'neutral' | 'success' | 'warning' | 'danger'> = {
  draft: 'neutral',
  active: 'success',
  inactive: 'warning',
  archived: 'danger',
};

const statusLabels: Record<Survey['status'], string> = {
  draft: 'Draft',
  active: 'Aktif',
  inactive: 'Nonaktif',
  archived: 'Diarsipkan',
};

export function SurveyListPage() {
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);
  const [targetSurvey, setTargetSurvey] = useState<{ id: string; title: string } | null>(null);
  const { confirm, dialog } = useConfirm();
  const navigate = useNavigate();

  const categories = [
    ...new Set(surveys.map((s) => s.category).filter(Boolean) as string[]),
  ].sort();
  const filtered = surveys.filter(
    (s) =>
      (!typeFilter || (s.surveyType ?? 'lainnya') === typeFilter) &&
      (!categoryFilter || s.category === categoryFilter),
  );

  const fetchSurveys = async () => {
    setLoading(true);
    try {
      const result = await api.get<Survey[]>('/surveys');
      setSurveys(result);
    } catch {
      setSurveys([]);
    } finally {
      setLoading(false);
    }
  };

  // ─── Unduh / unggah kuesioner (Excel) per survei ────────────────────────────
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const uploadTargetRef = useRef<{ id: string; title: string } | null>(null);

  /** Ambil pertanyaan survei dari server lalu ekspor ke Excel. */
  const handleDownloadQuestions = async (s: Survey) => {
    try {
      const qs = await api.get<
        {
          type: string;
          questionText: string;
          required: boolean;
          hasOtherOption?: boolean;
          options?: { label: string; value: string }[];
          validationRules?: { description?: string } | null;
        }[]
      >(`/surveys/${s.id}/questions`);
      if (!qs.length) {
        showAppNotice({ title: 'Survei ini belum punya pertanyaan.', tone: 'info' });
        return;
      }
      await exportQuestions(
        qs.map((q) => ({
          type: q.type,
          text: q.questionText,
          required: q.required,
          hasOtherOption: q.hasOtherOption,
          options: q.options,
          validationRules: q.validationRules,
        })),
        s.title,
      );
    } catch {
      showAppNotice({ title: 'Gagal mengunduh kuesioner.', tone: 'error' });
    }
  };

  const openUploadPicker = (s: Survey) => {
    uploadTargetRef.current = { id: s.id, title: s.title };
    importInputRef.current?.click();
  };

  /** Parse file lalu titipkan ke editor untuk ditinjau & disimpan (tidak simpan langsung). */
  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    const target = uploadTargetRef.current;
    if (!file || !target) return;
    try {
      const { questions: imported, errors } = await parseQuestionsFile(file);
      if (imported.length === 0) {
        showAppNotice({
          title: 'Tidak ada pertanyaan yang diimpor.',
          body: errors[0] ?? undefined,
          tone: 'error',
        });
        return;
      }
      setPendingImport(target.id, imported);
      showAppNotice({
        title: `${imported.length} pertanyaan siap ditambahkan.`,
        body: 'Membuka editor untuk ditinjau lalu disimpan…',
        tone: 'success',
      });
      navigate(`/admin/surveys/${target.id}/edit`);
    } catch {
      showAppNotice({
        title: 'Gagal membaca file.',
        body: 'Pastikan format .xlsx sesuai template.',
        tone: 'error',
      });
    }
  };

  useEffect(() => {
    fetchSurveys();
  }, []);

  const handleDuplicate = async (id: string) => {
    try {
      await api.post(`/surveys/${id}/duplicate`);
      fetchSurveys();
    } catch {
      showAppNotice({ title: 'Gagal menduplikasi survei', tone: 'error' });
    }
  };

  const handleActivate = async (id: string) => {
    try {
      await api.put(`/surveys/${id}/activate`);
      fetchSurveys();
    } catch (err: unknown) {
      const e = err as { message?: string };
      showAppNotice({ title: 'Gagal mengaktifkan survei', body: e.message, tone: 'error' });
    }
  };

  const handleDeactivate = async (id: string) => {
    try {
      await api.put(`/surveys/${id}/deactivate`);
      fetchSurveys();
    } catch (err: unknown) {
      const e = err as { message?: string };
      showAppNotice({ title: 'Gagal menonaktifkan survei', body: e.message, tone: 'error' });
    }
  };

  const handleArchive = async (id: string) => {
    try {
      await api.put(`/surveys/${id}/archive`);
      fetchSurveys();
    } catch (err: unknown) {
      const e = err as { message?: string };
      showAppNotice({ title: 'Gagal mengarsipkan survei', body: e.message, tone: 'error' });
    }
  };

  // Kirim email undangan "survei baru" ke responden yang belum mengisi (manual).
  const handleSendInvitations = async (s: Survey) => {
    const ok = await confirm({
      title: 'Kirim undangan',
      message: `Kirim email undangan survei "${s.title}" ke responden yang belum mengisi?`,
      confirmText: 'Kirim',
      danger: false,
    });
    if (!ok) return;
    try {
      const res = await api.post<{ recipients: number; pushed: number }>(
        `/surveys/${s.id}/invitations`,
      );
      showAppNotice({
        title:
          res.recipients > 0
            ? `Undangan email dikirim ke ${res.recipients} responden` +
              (res.pushed > 0 ? `, push ke ${res.pushed} perangkat.` : '.')
            : 'Tidak ada responden yang perlu diundang (semua sudah mengisi atau belum ada responden aktif).',
        tone: 'success',
      });
    } catch (err: unknown) {
      const e = err as { message?: string };
      showAppNotice({ title: 'Gagal mengirim undangan', body: e.message, tone: 'error' });
    }
  };

  const handleDelete = async (id: string) => {
    const ok = await confirm({
      title: 'Hapus survei',
      message: 'Apakah Anda yakin ingin menghapus survei ini?',
      confirmText: 'Hapus',
      danger: true,
    });
    if (!ok) return;
    try {
      await api.delete(`/surveys/${id}`);
      fetchSurveys();
    } catch {
      showAppNotice({ title: 'Gagal menghapus survei', tone: 'error' });
    }
  };

  const actions = (s: Survey) => [
    {
      icon: Pencil,
      label: 'Edit',
      cls: 'hover:text-primary-700',
      onClick: () => navigate(`/admin/surveys/${s.id}/edit`),
    },
    {
      icon: BarChart3,
      label: 'Ringkasan',
      cls: 'hover:text-indigo-700',
      onClick: () => navigate(`/admin/surveys/${s.id}/summary`),
    },
    {
      icon: Copy,
      label: 'Duplikasi',
      cls: 'hover:text-emerald-700',
      onClick: () => handleDuplicate(s.id),
    },
    {
      icon: Download,
      label: 'Unduh Kuesioner',
      cls: 'hover:text-indigo-700',
      onClick: () => handleDownloadQuestions(s),
    },
    {
      icon: Upload,
      label: 'Unggah Kuesioner',
      cls: 'hover:text-blue-700',
      onClick: () => openUploadPicker(s),
    },
    s.status === 'active'
      ? {
          icon: PauseCircle,
          label: 'Nonaktifkan',
          cls: 'hover:text-amber-700',
          onClick: () => handleDeactivate(s.id),
        }
      : {
          icon: PlayCircle,
          label: 'Aktifkan',
          cls: 'hover:text-emerald-700',
          onClick: () => handleActivate(s.id),
        },
    ...(s.status === 'active'
      ? [
          {
            icon: Send,
            label: 'Kirim Undangan',
            cls: 'hover:text-blue-700',
            onClick: () => handleSendInvitations(s),
          },
          {
            icon: Users,
            label: 'Undang Bertarget',
            cls: 'hover:text-indigo-700',
            onClick: () => setTargetSurvey({ id: s.id, title: s.title }),
          },
        ]
      : []),
    {
      icon: Archive,
      label: 'Arsipkan',
      cls: 'hover:text-gray-900',
      onClick: () => handleArchive(s.id),
    },
    { icon: Trash2, label: 'Hapus', cls: 'hover:text-red-700', onClick: () => handleDelete(s.id) },
  ];

  return (
    <div className="space-y-6">
      <SurveyEditorHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
      {/* Input file tersembunyi untuk Unggah Kuesioner (dipicu dari ikon per baris). */}
      <input
        ref={importInputRef}
        type="file"
        accept=".xlsx"
        onChange={handleUploadFile}
        className="hidden"
      />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Manajemen Survei</h1>
          <p className="mt-1 text-sm text-gray-500">Kelola, duplikasi, dan arsipkan survei Anda.</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setHelpOpen(true)}
            className="rounded-md bg-gray-100 px-4 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-200"
            title="Panduan: percabangan, skip & kelompok eksperimen"
          >
            📘 Panduan
          </button>
          <Button onClick={() => navigate('/admin/surveys/create')}>
            <Plus className="h-4 w-4" /> Buat Survei Baru
          </Button>
        </div>
      </div>

      {surveys.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
          >
            <option value="">Semua Tipe</option>
            <option value="nasional">Nasional</option>
            <option value="daerah">Daerah</option>
            <option value="lainnya">Lainnya</option>
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
          >
            <option value="">Semua Kategori</option>
            {categories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          {(typeFilter || categoryFilter) && (
            <button
              onClick={() => {
                setTypeFilter('');
                setCategoryFilter('');
              }}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Reset
            </button>
          )}
          <span className="text-sm text-gray-400">{filtered.length} survei</span>
        </div>
      )}

      <Card flush>
        {loading ? (
          <div className="p-10 text-center text-sm text-gray-500">Memuat...</div>
        ) : surveys.length === 0 ? (
          <div className="flex flex-col items-center gap-3 p-12 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 text-gray-400">
              <ClipboardList className="h-6 w-6" />
            </span>
            <p className="text-sm text-gray-500">
              Belum ada survei. Klik{' '}
              <span className="font-medium text-gray-700">Buat Survei Baru</span> untuk memulai.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/60">
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Judul
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Tipe / Kategori
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Status
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Reward
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Dibuat
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((survey) => {
                  const t = surveyTypeBadge[survey.surveyType ?? 'lainnya'];
                  return (
                    <tr key={survey.id} className="transition-colors hover:bg-gray-50/60">
                      <td className="px-4 py-3.5 text-sm font-medium text-gray-900">
                        {survey.title}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex flex-col gap-1">
                          <span
                            className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-semibold ${t.cls}`}
                          >
                            {t.label}
                          </span>
                          {survey.category && (
                            <span className="text-xs text-gray-500">{survey.category}</span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3.5">
                        <Badge tone={statusTone[survey.status]} dot>
                          {statusLabels[survey.status]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3.5 text-sm capitalize text-gray-600">
                        {survey.rewardMode}
                      </td>
                      <td className="px-4 py-3.5 text-sm text-gray-600">
                        {format(new Date(survey.createdAt), 'dd/MM/yyyy')}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center justify-end gap-1">
                          {actions(survey).map(({ icon: Icon, label, cls, onClick }) => (
                            <button
                              key={label}
                              onClick={onClick}
                              title={label}
                              aria-label={label}
                              className={`rounded-md p-1.5 text-gray-400 transition-colors hover:bg-gray-100 ${cls}`}
                            >
                              <Icon className="h-4 w-4" />
                            </button>
                          ))}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {targetSurvey && (
        <TargetedInviteModal
          surveyId={targetSurvey.id}
          surveyTitle={targetSurvey.title}
          onClose={() => setTargetSurvey(null)}
        />
      )}
      {dialog}
    </div>
  );
}
