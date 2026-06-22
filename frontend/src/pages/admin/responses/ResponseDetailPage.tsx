import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '@/services/api';
import { showAppNotice } from '@/stores/notification.store';
import { format } from 'date-fns';

interface AnswerItem {
  questionId: string;
  questionText: string;
  questionType: string;
  answer: string | string[] | number | null;
  // Wilayah & matriks dipecah jadi beberapa baris label→nilai (rapi + kode SPSS).
  parts?: { label: string; value: string }[] | null;
}

interface ResponseDetail {
  id: string;
  respondentName: string;
  respondentEmail: string;
  surveyTitle: string;
  status: 'completed' | 'partial' | 'abandoned';
  submittedAt: string;
  startedAt: string;
  deviceType: string;
  answers: AnswerItem[];
}

export function ResponseDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [response, setResponse] = useState<ResponseDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDetail = async () => {
      try {
        const result = await api.get<ResponseDetail>(`/responses/${id}`);
        setResponse(result);
      } catch {
        showAppNotice({ title: 'Gagal memuat detail respons', tone: 'error' });
        navigate('/admin/responses');
      } finally {
        setLoading(false);
      }
    };
    fetchDetail();
  }, [id, navigate]);

  if (loading) {
    return <div className="p-6 text-center text-gray-500">Memuat detail...</div>;
  }

  if (!response) return null;

  const formatAnswer = (answer: AnswerItem['answer']): string => {
    if (answer === null || answer === undefined) return '-';
    if (Array.isArray(answer)) return answer.join(', ');
    return String(answer);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/admin/responses')}
          className="text-gray-600 hover:text-gray-900"
        >
          ← Kembali
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Detail Respons</h1>
      </div>

      {/* Response Info */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Informasi Respons</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <span className="text-sm text-gray-500">Responden</span>
            <p className="text-sm font-medium text-gray-900">{response.respondentName}</p>
          </div>
          <div>
            <span className="text-sm text-gray-500">Email</span>
            <p className="text-sm font-medium text-gray-900">{response.respondentEmail}</p>
          </div>
          <div>
            <span className="text-sm text-gray-500">Survei</span>
            <p className="text-sm font-medium text-gray-900">{response.surveyTitle}</p>
          </div>
          <div>
            <span className="text-sm text-gray-500">Status</span>
            <p className="text-sm font-medium text-gray-900 capitalize">{response.status}</p>
          </div>
          <div>
            <span className="text-sm text-gray-500">Mulai</span>
            <p className="text-sm font-medium text-gray-900">
              {format(new Date(response.startedAt), 'dd/MM/yyyy HH:mm:ss')}
            </p>
          </div>
          <div>
            <span className="text-sm text-gray-500">Selesai</span>
            <p className="text-sm font-medium text-gray-900">
              {format(new Date(response.submittedAt), 'dd/MM/yyyy HH:mm:ss')}
            </p>
          </div>
          <div>
            <span className="text-sm text-gray-500">Perangkat</span>
            <p className="text-sm font-medium text-gray-900 capitalize">{response.deviceType}</p>
          </div>
        </div>
      </div>

      {/* Answers */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Jawaban ({response.answers.length})
        </h2>
        <div className="space-y-4">
          {response.answers.map((answer, idx) => (
            <div key={answer.questionId} className="border-b border-gray-100 pb-4 last:border-0">
              <div className="flex items-start gap-3">
                <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded font-mono">
                  {idx + 1}
                </span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-900">{answer.questionText}</p>
                  <p className="text-xs text-gray-400 mb-1 capitalize">{answer.questionType.replace('_', ' ')}</p>
                  {answer.parts && answer.parts.length > 0 ? (
                    <div className="overflow-hidden rounded border border-gray-100">
                      {answer.parts.map((p, i) => (
                        <div
                          key={i}
                          className="flex items-start justify-between gap-3 bg-gray-50 px-3 py-1.5 text-sm odd:bg-white"
                        >
                          <span className="text-gray-500">{p.label}</span>
                          <span className="text-right text-gray-800">{p.value}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-700 bg-gray-50 px-3 py-2 rounded">
                      {formatAnswer(answer.answer)}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
          {response.answers.length === 0 && (
            <p className="text-center text-gray-500">Tidak ada jawaban.</p>
          )}
        </div>
      </div>
    </div>
  );
}
