import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '@/services/api';
import { useConfirm } from '@/components/common/ConfirmDialog';

interface Assignment {
  surveyorId: string;
  surveyorName: string;
  surveyorEmail: string;
  quota: number | null;
  assignedNumbers: string[];
  usedCount: number;
  remaining: number | null;
}

interface AvailableSurveyor {
  id: string;
  fullName: string;
  email: string;
}

/** Perluas string nomor: dukung daftar (koma/spasi/baris) dan rentang "1-100" (opsional prefix). */
function parseNumbers(input: string, prefix = ''): string[] {
  const tokens = input
    .split(/[\s,]+/)
    .map((t) => t.trim())
    .filter(Boolean);
  const out: string[] = [];
  for (const tok of tokens) {
    const range = tok.match(/^(\d+)-(\d+)$/);
    if (range) {
      const start = Number(range[1]);
      const end = Number(range[2]);
      if (end >= start && end - start <= 10000) {
        for (let i = start; i <= end; i++) out.push(`${prefix}${i}`);
        continue;
      }
    }
    out.push(`${prefix}${tok}`);
  }
  return [...new Set(out)];
}

export function SurveySurveyorsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { confirm, dialog } = useConfirm();
  const [surveyTitle, setSurveyTitle] = useState('');
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [available, setAvailable] = useState<AvailableSurveyor[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // assign form
  const [newSurveyorId, setNewSurveyorId] = useState('');
  const [newQuota, setNewQuota] = useState('');

  const load = useCallback(async () => {
    const [list, avail] = await Promise.all([
      api.get<Assignment[]>(`/surveys/${id}/surveyors`),
      api.get<AvailableSurveyor[]>(`/surveys/${id}/surveyors/available`),
    ]);
    setAssignments(list);
    setAvailable(avail);
    setNewSurveyorId(avail[0]?.id ?? '');
  }, [id]);

  useEffect(() => {
    Promise.all([api.get<{ title: string }>(`/surveys/${id}`).catch(() => ({ title: '' })), load()])
      .then(([survey]) => setSurveyTitle(survey.title ?? ''))
      .catch(() => setError('Gagal memuat data surveyor.'))
      .finally(() => setLoading(false));
  }, [id, load]);

  const flash = (msg: string) => {
    setMessage(msg);
    setTimeout(() => setMessage(null), 2500);
  };

  const handleAssign = async () => {
    if (!newSurveyorId) return;
    setError(null);
    try {
      await api.post(`/surveys/${id}/surveyors`, {
        surveyorId: newSurveyorId,
        quota: newQuota ? Number(newQuota) : undefined,
      });
      setNewQuota('');
      await load();
      flash('Surveyor ditugaskan.');
    } catch (err: unknown) {
      setError((err as { message?: string }).message ?? 'Gagal menugaskan surveyor.');
    }
  };

  const handleUpdateQuota = async (surveyorId: string, quota: string) => {
    setError(null);
    try {
      await api.put(`/surveys/${id}/surveyors/${surveyorId}`, {
        quota: quota ? Number(quota) : undefined,
      });
      await load();
      flash('Kuota diperbarui.');
    } catch (err: unknown) {
      setError((err as { message?: string }).message ?? 'Gagal memperbarui kuota.');
    }
  };

  const handleAddNumbers = async (surveyorId: string, raw: string, prefix: string) => {
    const numbers = parseNumbers(raw, prefix);
    if (numbers.length === 0) return;
    setError(null);
    try {
      await api.post(`/surveys/${id}/surveyors/${surveyorId}/assign-numbers`, { numbers });
      await load();
      flash(`${numbers.length} nomor ditambahkan.`);
    } catch (err: unknown) {
      setError((err as { message?: string }).message ?? 'Gagal menambah nomor.');
    }
  };

  const handleRemove = async (surveyorId: string) => {
    const ok = await confirm({
      title: 'Lepas surveyor',
      message: 'Lepas surveyor ini dari survei? Respons yang sudah masuk tetap tersimpan.',
      confirmText: 'Lepas',
      danger: true,
    });
    if (!ok) return;
    setError(null);
    try {
      await api.delete(`/surveys/${id}/surveyors/${surveyorId}`);
      await load();
      flash('Surveyor dilepas.');
    } catch (err: unknown) {
      setError((err as { message?: string }).message ?? 'Gagal melepas surveyor.');
    }
  };

  if (loading) {
    return <div className="mx-auto max-w-4xl animate-pulse text-gray-400">Memuat...</div>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {dialog}
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/admin/surveys')}
          className="text-gray-600 hover:text-gray-900"
        >
          ← Kembali
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Surveyor / TPD</h1>
          {surveyTitle && <p className="text-sm text-gray-500">{surveyTitle}</p>}
        </div>
      </div>

      {message && (
        <div className="rounded-md bg-emerald-50 px-4 py-2 text-sm text-emerald-700 ring-1 ring-emerald-100">
          {message}
        </div>
      )}
      {error && (
        <div className="rounded-md bg-red-50 px-4 py-2 text-sm text-red-700 ring-1 ring-red-200">
          {error}
        </div>
      )}

      {/* Assign new surveyor */}
      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Tugaskan Surveyor</h2>
        {available.length === 0 ? (
          <p className="text-sm text-gray-500">
            Tidak ada pengguna ber-role surveyor yang tersedia. Buat akun surveyor di menu Pengguna.
          </p>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[220px] flex-1">
              <label className="mb-1 block text-xs font-medium text-gray-600">Surveyor</label>
              <select
                value={newSurveyorId}
                onChange={(e) => setNewSurveyorId(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              >
                {available.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.fullName} ({s.email})
                  </option>
                ))}
              </select>
            </div>
            <div className="w-32">
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Kuota (opsional)
              </label>
              <input
                type="number"
                min={1}
                value={newQuota}
                onChange={(e) => setNewQuota(e.target.value)}
                placeholder="∞"
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <button
              onClick={handleAssign}
              className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
            >
              Tugaskan
            </button>
          </div>
        )}
      </div>

      {/* Assigned list */}
      {assignments.length === 0 ? (
        <div className="rounded-lg border border-dashed border-gray-300 p-6 text-center text-sm text-gray-500">
          Belum ada surveyor yang ditugaskan.
        </div>
      ) : (
        assignments.map((a) => (
          <AssignmentCard
            key={a.surveyorId}
            assignment={a}
            onUpdateQuota={handleUpdateQuota}
            onAddNumbers={handleAddNumbers}
            onRemove={handleRemove}
          />
        ))
      )}
    </div>
  );
}

function AssignmentCard({
  assignment: a,
  onUpdateQuota,
  onAddNumbers,
  onRemove,
}: {
  assignment: Assignment;
  onUpdateQuota: (surveyorId: string, quota: string) => void;
  onAddNumbers: (surveyorId: string, raw: string, prefix: string) => void;
  onRemove: (surveyorId: string) => void;
}) {
  const [quota, setQuota] = useState(a.quota?.toString() ?? '');
  const [raw, setRaw] = useState('');
  const [prefix, setPrefix] = useState('');
  const usedNumbers = a.assignedNumbers.length;

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-gray-900">{a.surveyorName}</h3>
          <p className="text-xs text-gray-500">{a.surveyorEmail}</p>
        </div>
        <button
          onClick={() => onRemove(a.surveyorId)}
          className="text-sm text-red-500 hover:text-red-700"
        >
          Lepas
        </button>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-3 text-center text-sm">
        <div className="rounded-md bg-gray-50 p-2">
          <div className="font-bold text-gray-900">{a.usedCount}</div>
          <div className="text-xs text-gray-500">Terkumpul</div>
        </div>
        <div className="rounded-md bg-gray-50 p-2">
          <div className="font-bold text-gray-900">{a.remaining ?? '∞'}</div>
          <div className="text-xs text-gray-500">Sisa kuota</div>
        </div>
        <div className="rounded-md bg-gray-50 p-2">
          <div className="font-bold text-gray-900">{usedNumbers}</div>
          <div className="text-xs text-gray-500">Nomor</div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3 border-t border-gray-100 pt-3">
        <div className="w-32">
          <label className="mb-1 block text-xs font-medium text-gray-600">Kuota</label>
          <input
            type="number"
            min={1}
            value={quota}
            onChange={(e) => setQuota(e.target.value)}
            placeholder="∞"
            className="w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm"
          />
        </div>
        <button
          onClick={() => onUpdateQuota(a.surveyorId, quota)}
          className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Simpan kuota
        </button>
      </div>

      <div className="mt-3 border-t border-gray-100 pt-3">
        <label className="mb-1 block text-xs font-medium text-gray-600">
          Tambah nomor kuesioner (pisah koma/spasi/baris, atau rentang seperti 1-100)
        </label>
        <div className="flex flex-wrap items-end gap-2">
          <input
            value={prefix}
            onChange={(e) => setPrefix(e.target.value)}
            placeholder="Prefix (mis. JKT-)"
            className="w-36 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
          />
          <input
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder="1-100, A1, A2"
            className="min-w-[180px] flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
          />
          <button
            onClick={() => {
              onAddNumbers(a.surveyorId, raw, prefix);
              setRaw('');
            }}
            className="rounded-md bg-primary-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-primary-700"
          >
            Tambah
          </button>
        </div>
        {a.assignedNumbers.length > 0 && (
          <div className="mt-2 max-h-24 overflow-y-auto text-xs text-gray-500">
            {a.assignedNumbers.join(', ')}
          </div>
        )}
      </div>
    </div>
  );
}
