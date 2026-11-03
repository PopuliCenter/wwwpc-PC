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
  BarChart3,
  Send,
  Users,
  Download,
  Upload,
  BookOpen,
} from 'lucide-react';
import { api } from '@/services/api';
import { Card } from '@/components/common/Card';
import { Tag } from '@/components/common/Tag';
import { Button } from '@/components/common/Button';
import { thBaseCls, tdBaseCls } from '@/components/common/tableStyles';
import { IconButton } from '@/components/common/IconButton';
import { RowMenu, type RowMenuItem } from '@/components/common/RowMenu';
import { TableSkeleton } from '@/components/common/Skeleton';
import { fieldCls } from '@/components/common/fieldStyles';
import { SurveyStatusBadge, type SurveyStatus } from './SurveyStatusBadge';
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
  status: SurveyStatus;
  rewardMode: 'automatic' | 'manual';
  surveyType?: 'nasional' | 'daerah' | 'lainnya';
  category?: string | null;
  createdAt: string;
  startDate?: string;
  endDate?: string;
}

const surveyTypeLabels: Record<'nasional' | 'daerah' | 'lainnya', string> = {
  nasional: 'Nasional',
  daerah: 'Daerah',
  lainnya: 'Lainnya',
};

const rewardModeLabels: Record<Survey['rewardMode'], string> = {
  automatic: 'Otomatis',
  manual: 'Manual',
};

// Kepala tabel gaya laporan: garis navy di bawah, tanpa latar.
const thBase = `${thBaseCls} py-2.5`;
const thCls = `${thBase} text-left`;
const tdCls = `${tdBaseCls} py-3`;

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

  // Edit dan Ringkasan tampil langsung di baris; aksi lainnya masuk menu.
  const menuItems = (s: Survey): RowMenuItem[] => [
    {
      icon: Copy,
      label: 'Duplikasi',
      onClick: () => handleDuplicate(s.id),
    },
    {
      icon: Download,
      label: 'Unduh Kuesioner',
      onClick: () => handleDownloadQuestions(s),
    },
    {
      icon: Upload,
      label: 'Unggah Kuesioner',
      onClick: () => openUploadPicker(s),
    },
    s.status === 'active'
      ? {
          icon: PauseCircle,
          label: 'Nonaktifkan',
          onClick: () => handleDeactivate(s.id),
        }
      : {
          icon: PlayCircle,
          label: 'Aktifkan',
          onClick: () => handleActivate(s.id),
        },
    ...(s.status === 'active'
      ? [
          {
            icon: Send,
            label: 'Kirim Undangan',
            onClick: () => handleSendInvitations(s),
          },
          {
            icon: Users,
            label: 'Undang Bertarget',
            onClick: () => setTargetSurvey({ id: s.id, title: s.title }),
          },
        ]
      : []),
    {
      icon: Archive,
      label: 'Arsipkan',
      onClick: () => handleArchive(s.id),
    },
    { icon: Trash2, label: 'Hapus', destructive: true, onClick: () => handleDelete(s.id) },
  ];

  const activeCount = surveys.filter((s) => s.status === 'active').length;

  return (
    <div className="space-y-6">
      <SurveyEditorHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
      {/* Input file tersembunyi untuk Unggah Kuesioner (dipicu dari menu per baris). */}
      <input
        ref={importInputRef}
        type="file"
        accept=".xlsx"
        onChange={handleUploadFile}
        className="hidden"
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl text-gray-900">Manajemen Survei</h1>
          {!loading && surveys.length > 0 && (
            <p className="mt-1 text-sm text-gray-600 tabular-nums">
              {surveys.length} survei · {activeCount} aktif
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setHelpOpen(true)}
            title="Panduan: percabangan, skip & kelompok eksperimen"
          >
            <BookOpen className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" /> Panduan
          </Button>
          <Button type="button" onClick={() => navigate('/admin/surveys/create')}>
            <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" /> Buat Survei Baru
          </Button>
        </div>
      </div>

      {surveys.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <div className="w-full sm:w-44">
            <select
              aria-label="Saring menurut tipe"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className={fieldCls}
            >
              <option value="">Semua Tipe</option>
              <option value="nasional">Nasional</option>
              <option value="daerah">Daerah</option>
              <option value="lainnya">Lainnya</option>
            </select>
          </div>
          <div className="w-full sm:w-52">
            <select
              aria-label="Saring menurut kategori"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className={fieldCls}
            >
              <option value="">Semua Kategori</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
          {(typeFilter || categoryFilter) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setTypeFilter('');
                setCategoryFilter('');
              }}
            >
              Reset
            </Button>
          )}
          <span className="text-sm text-gray-600 tabular-nums">{filtered.length} survei</span>
        </div>
      )}

      <Card flush className="overflow-hidden">
        {loading ? (
          <TableSkeleton rows={5} cols={6} />
        ) : surveys.length === 0 ? (
          <p className="p-12 text-center text-sm text-gray-600">
            Belum ada survei. Klik{' '}
            <span className="font-medium text-gray-800">Buat Survei Baru</span> untuk memulai.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr>
                  <th className={thCls}>Judul</th>
                  <th className={thCls}>Tipe / Kategori</th>
                  <th className={thCls}>Status</th>
                  <th className={thCls}>Reward</th>
                  <th className={thCls}>Dibuat</th>
                  <th className={`${thBase} text-right`}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((survey) => (
                  <tr
                    key={survey.id}
                    className="transition-colors hover:bg-gray-50 [&:last-child>td]:border-b-0"
                  >
                    <td className={`${tdCls} min-w-48 text-sm font-medium text-gray-900`}>
                      {survey.title}
                    </td>
                    <td className={tdCls}>
                      <div className="flex flex-col items-start gap-1">
                        <Tag>{surveyTypeLabels[survey.surveyType ?? 'lainnya']}</Tag>
                        {survey.category && (
                          <span className="text-xs text-gray-600">{survey.category}</span>
                        )}
                      </div>
                    </td>
                    <td className={`${tdCls} whitespace-nowrap`}>
                      <SurveyStatusBadge status={survey.status} />
                    </td>
                    <td className={`${tdCls} text-sm text-gray-600`}>
                      {rewardModeLabels[survey.rewardMode] ?? survey.rewardMode}
                    </td>
                    <td className={`${tdCls} whitespace-nowrap text-sm text-gray-600`}>
                      {format(new Date(survey.createdAt), 'dd/MM/yyyy')}
                    </td>
                    <td className={tdCls}>
                      <div className="flex items-center justify-end gap-1">
                        <IconButton
                          aria-label="Edit"
                          onClick={() => navigate(`/admin/surveys/${survey.id}/edit`)}
                        >
                          <Pencil className="h-[18px] w-[18px]" strokeWidth={1.75} />
                        </IconButton>
                        <IconButton
                          aria-label="Ringkasan"
                          onClick={() => navigate(`/admin/surveys/${survey.id}/summary`)}
                        >
                          <BarChart3 className="h-[18px] w-[18px]" strokeWidth={1.75} />
                        </IconButton>
                        <RowMenu
                          label={`Aksi lainnya untuk ${survey.title}`}
                          items={menuItems(survey)}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
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
