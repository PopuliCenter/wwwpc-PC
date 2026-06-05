import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '@/services/api';

type QuestionType =
  | 'single_choice'
  | 'multiple_choice'
  | 'text_short'
  | 'text_long'
  | 'rating_scale'
  | 'likert'
  | 'dropdown'
  | 'date'
  | 'number'
  | 'file_upload';

interface QuestionOption {
  id: string;
  text: string;
  order: number;
}

interface Question {
  id: string;
  type: QuestionType;
  text: string;
  required: boolean;
  order: number;
  options?: QuestionOption[];
}

interface SurveyPreview {
  id: string;
  title: string;
  description: string;
  questions: Question[];
}

function QuestionPreview({ question }: { question: Question }) {
  const renderInput = () => {
    switch (question.type) {
      case 'single_choice':
        return (
          <div className="space-y-2">
            {(question.options ?? []).map((opt) => (
              <label key={opt.id} className="flex items-center gap-2">
                <input type="radio" name={question.id} disabled className="text-primary-600" />
                <span className="text-sm text-gray-700">{opt.text}</span>
              </label>
            ))}
          </div>
        );
      case 'multiple_choice':
        return (
          <div className="space-y-2">
            {(question.options ?? []).map((opt) => (
              <label key={opt.id} className="flex items-center gap-2">
                <input type="checkbox" disabled className="rounded text-primary-600" />
                <span className="text-sm text-gray-700">{opt.text}</span>
              </label>
            ))}
          </div>
        );
      case 'text_short':
        return (
          <input
            type="text"
            disabled
            placeholder="Jawaban singkat..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50"
          />
        );
      case 'text_long':
        return (
          <textarea
            disabled
            rows={3}
            placeholder="Jawaban panjang..."
            className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50"
          />
        );
      case 'rating_scale':
        return (
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                disabled
                className="w-10 h-10 border border-gray-300 rounded-md text-gray-500 bg-gray-50"
              >
                {n}
              </button>
            ))}
          </div>
        );
      case 'likert':
        return (
          <div className="flex gap-2">
            {['Sangat Tidak Setuju', 'Tidak Setuju', 'Netral', 'Setuju', 'Sangat Setuju'].map((label) => (
              <label key={label} className="flex flex-col items-center gap-1">
                <input type="radio" name={question.id} disabled />
                <span className="text-xs text-gray-500 text-center">{label}</span>
              </label>
            ))}
          </div>
        );
      case 'dropdown':
        return (
          <select disabled className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50">
            <option>Pilih...</option>
            {(question.options ?? []).map((opt) => (
              <option key={opt.id}>{opt.text}</option>
            ))}
          </select>
        );
      case 'date':
        return (
          <input
            type="date"
            disabled
            className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50"
          />
        );
      case 'number':
        return (
          <input
            type="number"
            disabled
            placeholder="0"
            className="w-full px-3 py-2 border border-gray-300 rounded-md bg-gray-50"
          />
        );
      case 'file_upload':
        return (
          <div className="border-2 border-dashed border-gray-300 rounded-md p-6 text-center text-gray-500 bg-gray-50">
            📎 Klik atau drag file untuk upload
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5">
      <div className="mb-3">
        <span className="text-sm font-medium text-gray-900">
          {question.text || 'Pertanyaan tanpa teks'}
        </span>
        {question.required && <span className="text-red-500 ml-1">*</span>}
      </div>
      {renderInput()}
    </div>
  );
}

export function SurveyPreviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [survey, setSurvey] = useState<SurveyPreview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSurvey = async () => {
      try {
        const result = await api.get<SurveyPreview>(`/surveys/${id}`);
        setSurvey(result);
      } catch {
        alert('Gagal memuat survei');
        navigate('/admin/surveys');
      } finally {
        setLoading(false);
      }
    };
    fetchSurvey();
  }, [id, navigate]);

  if (loading) {
    return <div className="p-6 text-center text-gray-500">Memuat preview...</div>;
  }

  if (!survey) return null;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate(`/admin/surveys/${id}/edit`)}
          className="text-gray-600 hover:text-gray-900"
        >
          ← Kembali ke Editor
        </button>
        <span className="px-3 py-1 bg-purple-100 text-purple-700 text-sm rounded-full">
          Mode Preview
        </span>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-2xl font-bold text-gray-900">{survey.title}</h1>
        {survey.description && (
          <p className="mt-2 text-gray-600">{survey.description}</p>
        )}
      </div>

      <div className="space-y-4">
        {(survey.questions ?? [])
          .sort((a, b) => a.order - b.order)
          .map((question, idx) => (
            <div key={question.id}>
              <span className="text-xs text-gray-400 mb-1 block">Pertanyaan {idx + 1}</span>
              <QuestionPreview question={question} />
            </div>
          ))}
      </div>

      {(!survey.questions || survey.questions.length === 0) && (
        <div className="text-center py-8 text-gray-500">
          Survei ini belum memiliki pertanyaan.
        </div>
      )}
    </div>
  );
}
