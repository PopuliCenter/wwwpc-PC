import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '@/services/api';

interface BackendQuestion {
  id: string;
  type: string;
  questionText: string;
  required: boolean;
  enabled?: boolean;
  orderIndex: number;
  validationRules: {
    matrixRows?: string[];
    matrixColumns?: string[];
    ratingMax?: number;
    description?: string;
  } | null;
  hasOtherOption?: boolean;
  options?: { id: string; label: string; value: string; orderIndex: number }[];
}

interface PreviewQuestion {
  id: string;
  type: string;
  text: string;
  required: boolean;
  enabled: boolean;
  order: number;
  description?: string;
  hasOtherOption: boolean;
  options: { id: string; label: string }[];
  matrixRows: string[];
  matrixColumns: string[];
  ratingMax: number;
}

function mapQuestion(q: BackendQuestion, idx: number): PreviewQuestion {
  return {
    id: q.id,
    type: q.type,
    text: q.questionText ?? '',
    required: !!q.required,
    enabled: q.enabled !== false,
    order: q.orderIndex ?? idx,
    description: q.validationRules?.description,
    hasOtherOption: !!q.hasOtherOption,
    options: (q.options ?? [])
      .slice()
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((o) => ({ id: o.id, label: o.label })),
    matrixRows: q.validationRules?.matrixRows ?? [],
    matrixColumns: q.validationRules?.matrixColumns ?? [],
    ratingMax: q.validationRules?.ratingMax ?? 5,
  };
}

const inputCls =
  'w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-500';

function QuestionInput({ q }: { q: PreviewQuestion }) {
  switch (q.type) {
    case 'single_choice':
    case 'multiple_choice':
      return (
        <div className="space-y-2">
          {q.options.map((o) => (
            <label key={o.id} className="flex items-center gap-2 text-sm text-gray-700">
              <input type={q.type === 'single_choice' ? 'radio' : 'checkbox'} disabled name={q.id} />
              {o.label}
            </label>
          ))}
          {q.hasOtherOption && (
            <label className="flex items-center gap-2 text-sm text-gray-500">
              <input type={q.type === 'single_choice' ? 'radio' : 'checkbox'} disabled name={q.id} />
              Lainnya…
            </label>
          )}
        </div>
      );
    case 'dropdown':
      return (
        <select disabled className={inputCls}>
          <option>Pilih…</option>
          {q.options.map((o) => <option key={o.id}>{o.label}</option>)}
        </select>
      );
    case 'short_text':
    case 'phone_number':
    case 'unique_id':
      return <input disabled placeholder="Jawaban teks…" className={inputCls} />;
    case 'long_text':
      return <textarea disabled rows={3} placeholder="Jawaban panjang…" className={inputCls} />;
    case 'numeric_scale':
      return <input disabled type="number" placeholder="Angka" className={inputCls} />;
    case 'rating_scale':
      return (
        <div className="flex gap-1 text-2xl text-gray-300">
          {Array.from({ length: q.ratingMax }).map((_, i) => <span key={i}>★</span>)}
        </div>
      );
    case 'date':
      return <input disabled type="date" className={inputCls} />;
    case 'date_time':
      return <input disabled type="datetime-local" className={inputCls} />;
    case 'indonesia_region':
      return (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {['Provinsi', 'Kab/Kota', 'Kecamatan'].map((l) => (
            <select key={l} disabled className={inputCls}><option>{l}…</option></select>
          ))}
        </div>
      );
    case 'matrix_likert':
      return (
        <div className="overflow-x-auto">
          <table className="min-w-full border text-sm">
            <thead>
              <tr>
                <th className="border bg-gray-50 px-2 py-1" />
                {q.matrixColumns.map((c) => (
                  <th key={c} className="border bg-gray-50 px-2 py-1 text-xs font-medium text-gray-600">{c}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {q.matrixRows.map((r) => (
                <tr key={r}>
                  <td className="border px-2 py-1 text-xs text-gray-700">{r}</td>
                  {q.matrixColumns.map((c) => (
                    <td key={c} className="border px-2 py-1 text-center"><input type="radio" disabled /></td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case 'file_upload':
    case 'photo':
    case 'audio':
    case 'signature':
      return (
        <div className="rounded-md border border-dashed border-gray-300 px-3 py-4 text-center text-xs text-gray-400">
          {q.type === 'photo' ? 'Ambil/unggah foto' : q.type === 'audio' ? 'Rekam audio' : q.type === 'signature' ? 'Tanda tangan' : 'Unggah berkas'}
        </div>
      );
    default:
      return <input disabled placeholder="Jawaban…" className={inputCls} />;
  }
}

export function SurveyPreviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [questions, setQuestions] = useState<PreviewQuestion[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [survey, rawQuestions] = await Promise.all([
          api.get<{ title: string; description: string }>(`/surveys/${id}`),
          api.get<BackendQuestion[]>(`/surveys/${id}/questions`),
        ]);
        setTitle(survey.title);
        setDescription(survey.description ?? '');
        setQuestions((rawQuestions ?? []).map(mapQuestion).filter((q) => q.enabled));
      } catch {
        alert('Gagal memuat survei');
        navigate('/admin/surveys');
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [id, navigate]);

  if (loading) return <div className="p-6 text-center text-gray-500">Memuat preview...</div>;

  const sorted = [...questions].sort((a, b) => a.order - b.order);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <button onClick={() => navigate(`/admin/surveys/${id}/edit`)} className="text-gray-600 hover:text-gray-900">
          ← Kembali ke Editor
        </button>
        <span className="rounded-full bg-purple-100 px-3 py-1 text-sm text-purple-700">Mode Preview</span>
      </div>

      <div className="rounded-lg bg-white p-6 shadow">
        <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
        {description && <p className="mt-2 text-gray-600">{description}</p>}
      </div>

      <div className="space-y-4">
        {sorted.map((q, idx) => (
          <div key={q.id} className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-sm font-semibold text-gray-900">
              {idx + 1}. {q.text || <span className="italic text-gray-400">(tanpa teks)</span>}
              {q.required && <span className="ml-1 text-red-500">*</span>}
            </p>
            {q.description && <p className="mb-2 mt-0.5 text-xs text-gray-500">{q.description}</p>}
            <div className="mt-2"><QuestionInput q={q} /></div>
          </div>
        ))}
      </div>

      {sorted.length === 0 && (
        <div className="py-8 text-center text-gray-500">Survei ini belum memiliki pertanyaan.</div>
      )}
    </div>
  );
}
