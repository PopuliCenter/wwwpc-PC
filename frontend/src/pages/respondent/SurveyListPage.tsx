import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/services/api';
import { format } from 'date-fns';

interface AvailableSurvey {
  id: string;
  title: string;
  description: string;
  deadline: string;
  estimatedTime: number;
  rewardMode: 'auto_point' | 'manual';
  rewardPoints?: number;
  rewardDescription?: string;
  questionCount: number;
}

export function SurveyListPage() {
  const [surveys, setSurveys] = useState<AvailableSurvey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchSurveys = async () => {
      try {
        const result = await api.get<AvailableSurvey[]>('/surveys/available');
        setSurveys(result);
      } catch {
        setError('Gagal memuat daftar survei');
      } finally {
        setLoading(false);
      }
    };
    fetchSurveys();
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-gray-900">Survei Tersedia</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-white rounded-lg shadow p-6 animate-pulse">
              <div className="h-5 bg-gray-200 rounded w-3/4 mb-3"></div>
              <div className="h-4 bg-gray-200 rounded w-full mb-2"></div>
              <div className="h-4 bg-gray-200 rounded w-2/3 mb-4"></div>
              <div className="h-8 bg-gray-200 rounded w-1/3"></div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-gray-900">Survei Tersedia</h1>
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">{error}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-gray-900">Survei Tersedia</h1>

      {surveys.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          <p className="text-lg">Belum ada survei yang tersedia saat ini.</p>
          <p className="text-sm mt-2">Silakan cek kembali nanti.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {surveys.map((survey) => (
            <div
              key={survey.id}
              className="bg-white rounded-lg shadow hover:shadow-md transition-shadow p-6 flex flex-col"
            >
              <h3 className="text-lg font-semibold text-gray-900 mb-2">{survey.title}</h3>
              <p className="text-sm text-gray-600 mb-4 line-clamp-2 flex-1">
                {survey.description}
              </p>

              <div className="space-y-2 mb-4">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <span>📅</span>
                  <span>Deadline: {format(new Date(survey.deadline), 'dd MMM yyyy')}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <span>⏱️</span>
                  <span>Estimasi: {survey.estimatedTime} menit</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <span>❓</span>
                  <span>{survey.questionCount} pertanyaan</span>
                </div>
                {survey.rewardMode === 'auto_point' && survey.rewardPoints && (
                  <div className="flex items-center gap-2 text-sm text-green-600 font-medium">
                    <span>🎁</span>
                    <span>{survey.rewardPoints} poin</span>
                  </div>
                )}
                {survey.rewardMode === 'manual' && survey.rewardDescription && (
                  <div className="flex items-center gap-2 text-sm text-primary-600 font-medium">
                    <span>🎁</span>
                    <span>{survey.rewardDescription}</span>
                  </div>
                )}
              </div>

              <button
                onClick={() => navigate(`/surveys/${survey.id}/fill`)}
                className="w-full bg-primary-600 text-white py-2 px-4 rounded-md hover:bg-primary-700 transition-colors text-sm font-medium"
              >
                Isi Survei
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
