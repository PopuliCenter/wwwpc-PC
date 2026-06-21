import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Pencil, Copy, PlayCircle, PauseCircle, Archive, Trash2, ClipboardList, BarChart3, Send, Users } from 'lucide-react';
import { api } from '@/services/api';
import { Card } from '@/components/common/Card';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import { TargetedInviteModal } from './TargetedInviteModal';
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
  const [targetSurvey, setTargetSurvey] = useState<{ id: string; title: string } | null>(null);
  const navigate = useNavigate();

  const categories = [...new Set(surveys.map((s) => s.category).filter(Boolean) as string[])].sort();
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

  useEffect(() => {
    fetchSurveys();
  }, []);

  const handleDuplicate = async (id: string) => {
    try {
      await api.post(`/surveys/${id}/duplicate`);
      fetchSurveys();
    } catch {
      alert('Gagal menduplikasi survei');
    }
  };

  const handleActivate = async (id: string) => {
    try {
      await api.put(`/surveys/${id}/activate`);
      fetchSurveys();
    } catch (err: unknown) {
      const e = err as { message?: string };
      alert(e.message || 'Gagal mengaktifkan survei');
    }
  };

  const handleDeactivate = async (id: string) => {
    try {
      await api.put(`/surveys/${id}/deactivate`);
      fetchSurveys();
    } catch (err: unknown) {
      const e = err as { message?: string };
      alert(e.message || 'Gagal menonaktifkan survei');
    }
  };

  const handleArchive = async (id: string) => {
    try {
      await api.put(`/surveys/${id}/archive`);
      fetchSurveys();
    } catch (err: unknown) {
      const e = err as { message?: string };
      alert(e.message || 'Gagal mengarsipkan survei');
    }
  };

  // Kirim email undangan "survei baru" ke responden yang belum mengisi (manual).
  const handleSendInvitations = async (s: Survey) => {
    if (
      !confirm(
        `Kirim email undangan survei "${s.title}" ke responden yang belum mengisi?`,
      )
    )
      return;
    try {
      const res = await api.post<{ recipients: number; pushed: number }>(
        `/surveys/${s.id}/invitations`,
      );
      alert(
        res.recipients > 0
          ? `Undangan email dikirim ke ${res.recipients} responden` +
              (res.pushed > 0 ? `, push ke ${res.pushed} perangkat.` : '.')
          : 'Tidak ada responden yang perlu diundang (semua sudah mengisi atau belum ada responden aktif).',
      );
    } catch (err: unknown) {
      const e = err as { message?: string };
      alert(e.message || 'Gagal mengirim undangan');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus survei ini?')) return;
    try {
      await api.delete(`/surveys/${id}`);
      fetchSurveys();
    } catch {
      alert('Gagal menghapus survei');
    }
  };

  const actions = (s: Survey) => [
    { icon: Pencil, label: 'Edit', cls: 'hover:text-primary-700', onClick: () => navigate(`/admin/surveys/${s.id}/edit`) },
    { icon: BarChart3, label: 'Ringkasan', cls: 'hover:text-indigo-700', onClick: () => navigate(`/admin/surveys/${s.id}/summary`) },
    { icon: Copy, label: 'Duplikasi', cls: 'hover:text-emerald-700', onClick: () => handleDuplicate(s.id) },
    s.status === 'active'
      ? { icon: PauseCircle, label: 'Nonaktifkan', cls: 'hover:text-amber-700', onClick: () => handleDeactivate(s.id) }
      : { icon: PlayCircle, label: 'Aktifkan', cls: 'hover:text-emerald-700', onClick: () => handleActivate(s.id) },
    ...(s.status === 'active'
      ? [
          { icon: Send, label: 'Kirim Undangan', cls: 'hover:text-blue-700', onClick: () => handleSendInvitations(s) },
          { icon: Users, label: 'Undang Bertarget', cls: 'hover:text-indigo-700', onClick: () => setTargetSurvey({ id: s.id, title: s.title }) },
        ]
      : []),
    { icon: Archive, label: 'Arsipkan', cls: 'hover:text-gray-900', onClick: () => handleArchive(s.id) },
    { icon: Trash2, label: 'Hapus', cls: 'hover:text-red-700', onClick: () => handleDelete(s.id) },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Manajemen Survei</h1>
          <p className="mt-1 text-sm text-gray-500">Kelola, duplikasi, dan arsipkan survei Anda.</p>
        </div>
        <Button onClick={() => navigate('/admin/surveys/create')}>
          <Plus className="h-4 w-4" /> Buat Survei Baru
        </Button>
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
              Belum ada survei. Klik <span className="font-medium text-gray-700">Buat Survei Baru</span> untuk memulai.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50/60">
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Judul</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Tipe / Kategori</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Reward</th>
                  <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Dibuat</th>
                  <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-500">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filtered.map((survey) => {
                  const t = surveyTypeBadge[survey.surveyType ?? 'lainnya'];
                  return (
                  <tr key={survey.id} className="transition-colors hover:bg-gray-50/60">
                    <td className="px-6 py-3.5 text-sm font-medium text-gray-900">{survey.title}</td>
                    <td className="px-6 py-3.5">
                      <div className="flex flex-col gap-1">
                        <span className={`inline-flex w-fit items-center rounded-full px-2 py-0.5 text-xs font-semibold ${t.cls}`}>
                          {t.label}
                        </span>
                        {survey.category && (
                          <span className="text-xs text-gray-500">{survey.category}</span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-3.5">
                      <Badge tone={statusTone[survey.status]} dot>
                        {statusLabels[survey.status]}
                      </Badge>
                    </td>
                    <td className="px-6 py-3.5 text-sm capitalize text-gray-600">{survey.rewardMode}</td>
                    <td className="px-6 py-3.5 text-sm text-gray-600">
                      {format(new Date(survey.createdAt), 'dd/MM/yyyy')}
                    </td>
                    <td className="px-6 py-3.5">
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
    </div>
  );
}
