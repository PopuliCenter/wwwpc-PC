import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { api } from '@/services/api';
import { showAppNotice } from '@/stores/notification.store';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { Skeleton } from '@/components/common/Skeleton';
import { format } from 'date-fns';
import { ResponseStatusLabel } from './ResponseStatusLabel';
import { questionTypeLabels } from '../surveys/questionTypeMeta';
import type { QuestionType } from '../surveys/surveyEditTypes';

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
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <Skeleton className="h-8 w-1/2" />
        <Card>
          <Skeleton className="mb-4 h-6 w-1/3" />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </Card>
        <Card>
          <Skeleton className="mb-4 h-6 w-1/3" />
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        </Card>
      </div>
    );
  }

  if (!response) return null;

  const formatAnswer = (answer: AnswerItem['answer']): string => {
    if (answer === null || answer === undefined) return '-';
    if (Array.isArray(answer)) return answer.join(', ');
    return String(answer);
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => navigate('/admin/responses')}
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" /> Kembali
        </Button>
        <h1 className="text-2xl font-bold text-gray-900">Detail Respons</h1>
      </div>

      {/* Response Info */}
      <Card>
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Informasi Respons</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div>
            <span className="text-sm text-gray-600">Responden</span>
            <p className="text-sm font-medium text-gray-900">{response.respondentName}</p>
          </div>
          <div>
            <span className="text-sm text-gray-600">Email</span>
            <p className="text-sm font-medium text-gray-900 [overflow-wrap:anywhere]">
              {response.respondentEmail}
            </p>
          </div>
          <div>
            <span className="text-sm text-gray-600">Survei</span>
            <p className="text-sm font-medium text-gray-900">{response.surveyTitle}</p>
          </div>
          <div>
            <span className="text-sm text-gray-600">Status</span>
            <p>
              <ResponseStatusLabel status={response.status} />
            </p>
          </div>
          <div>
            <span className="text-sm text-gray-600">Mulai</span>
            <p className="text-sm font-medium tabular-nums text-gray-900">
              {format(new Date(response.startedAt), 'dd/MM/yyyy HH:mm:ss')}
            </p>
          </div>
          <div>
            <span className="text-sm text-gray-600">Selesai</span>
            <p className="text-sm font-medium tabular-nums text-gray-900">
              {format(new Date(response.submittedAt), 'dd/MM/yyyy HH:mm:ss')}
            </p>
          </div>
          <div>
            <span className="text-sm text-gray-600">Perangkat</span>
            <p className="text-sm font-medium capitalize text-gray-900">{response.deviceType}</p>
          </div>
        </div>
      </Card>

      {/* Answers */}
      <Card>
        <h2 className="mb-4 text-lg font-semibold text-gray-900">
          Jawaban ({response.answers.length})
        </h2>
        <div className="space-y-4">
          {response.answers.map((answer, idx) => (
            <div key={answer.questionId} className="border-b border-gray-100 pb-4 last:border-0">
              <div className="flex items-start gap-3">
                <span className="w-6 shrink-0 pt-px text-right text-xs tabular-nums text-gray-500">
                  {idx + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900">{answer.questionText}</p>
                  <p className="mb-1 text-xs text-gray-500">
                    {questionTypeLabels[answer.questionType as QuestionType] ?? answer.questionType}
                  </p>
                  {answer.parts && answer.parts.length > 0 ? (
                    <div className="divide-y divide-gray-100 rounded-lg border border-gray-200">
                      {answer.parts.map((p, i) => (
                        <div
                          key={i}
                          className="flex items-start justify-between gap-3 px-3 py-1.5 text-sm"
                        >
                          <span className="text-gray-600">{p.label}</span>
                          <span className="text-right text-gray-800 [overflow-wrap:anywhere]">
                            {p.value}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="break-words rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">
                      {formatAnswer(answer.answer)}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ))}
          {response.answers.length === 0 && (
            <p className="text-center text-gray-600">Tidak ada jawaban.</p>
          )}
        </div>
      </Card>
    </div>
  );
}
