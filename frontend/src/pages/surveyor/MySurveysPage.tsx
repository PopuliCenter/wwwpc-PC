import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/services/api';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';

interface MySurvey {
  surveyId: string;
  title: string;
  description: string;
  quota: number | null;
  usedCount: number;
  remaining: number | null;
  assignedNumberCount: number;
}

export function MySurveysPage() {
  const navigate = useNavigate();
  const [surveys, setSurveys] = useState<MySurvey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<MySurvey[]>('/surveyor/surveys')
      .then(setSurveys)
      .catch(() => setError('Gagal memuat daftar survei.'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl">
        <Card className="animate-pulse">
          <div className="mb-3 h-5 w-1/2 rounded bg-gray-200" />
          <div className="h-4 w-3/4 rounded bg-gray-200" />
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Survei Saya</h1>
        <p className="text-sm text-gray-600">Survei lapangan yang ditugaskan kepada Anda.</p>
      </div>

      {error && (
        <Card className="border-red-200 bg-red-50 text-sm text-red-700">{error}</Card>
      )}

      {!error && surveys.length === 0 && (
        <Card className="text-center text-sm text-gray-500">
          Belum ada survei yang ditugaskan kepada Anda.
        </Card>
      )}

      {surveys.map((s) => {
        const pct =
          s.quota && s.quota > 0 ? Math.min(Math.round((s.usedCount / s.quota) * 100), 100) : null;
        return (
          <Card key={s.surveyId}>
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-gray-900">{s.title}</h2>
                {s.description && (
                  <p className="mt-0.5 line-clamp-2 text-sm text-gray-600">{s.description}</p>
                )}
              </div>
              <Button onClick={() => navigate(`/surveyor/surveys/${s.surveyId}/collect`)}>
                Isi Kuesioner
              </Button>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3 text-center">
              <div className="rounded-lg bg-gray-50 p-2.5">
                <div className="text-lg font-bold text-gray-900">{s.usedCount}</div>
                <div className="text-xs text-gray-500">Terkumpul</div>
              </div>
              <div className="rounded-lg bg-gray-50 p-2.5">
                <div className="text-lg font-bold text-gray-900">
                  {s.quota ?? '∞'}
                </div>
                <div className="text-xs text-gray-500">Kuota</div>
              </div>
              <div className="rounded-lg bg-gray-50 p-2.5">
                <div className="text-lg font-bold text-gray-900">{s.assignedNumberCount}</div>
                <div className="text-xs text-gray-500">Nomor</div>
              </div>
            </div>

            {pct != null && (
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-gray-200">
                <div
                  className="h-2 rounded-full bg-primary-600 transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}
