import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/services/api';
import { useAuthStore } from '@/stores/auth.store';
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
  completed?: boolean;
}

export function SurveyListPage() {
  const [surveys, setSurveys] = useState<AvailableSurvey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const firstName = user?.fullName?.trim().split(' ')[0] ?? '';

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

  const availableCount = surveys.filter((s) => !s.completed).length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">
          Halo, {firstName || 'Responden'} 👋
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          {availableCount > 0
            ? `Ada ${availableCount} survei menunggu untuk diisi. Setiap survei berhadiah poin.`
            : 'Belum ada survei baru untuk Anda saat ini. Cek lagi nanti, ya.'}
        </p>
      </div>

      {surveys.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          <p className="text-lg">Belum ada survei yang tersedia saat ini.</p>
          <p className="text-sm mt-2">Silakan cek kembali nanti.</p>
        </div>
      ) : (
        <>
          <h2 className="text-sm font-semibold text-gray-700">Survei tersedia</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {surveys.map((survey) => (
            <div
              key={survey.id}
              className={`bg-white rounded-lg shadow transition-shadow p-6 flex flex-col ${
                survey.completed ? 'opacity-75' : 'hover:shadow-md'
              }`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <h3 className="text-lg font-semibold text-gray-900">{survey.title}</h3>
                {survey.completed && (
                  <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                    ✓ Sudah diisi
                  </span>
                )}
              </div>
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

              {survey.completed ? (
                <button
                  disabled
                  className="w-full bg-gray-100 text-gray-400 py-2 px-4 rounded-md text-sm font-medium cursor-not-allowed"
                >
                  Sudah Diisi
                </button>
              ) : (
                <button
                  onClick={() => navigate(`/surveys/${survey.id}/fill`)}
                  className="w-full bg-primary-600 text-white py-2 px-4 rounded-md hover:bg-primary-700 transition-colors text-sm font-medium"
                >
                  Isi Survei
                </button>
              )}
            </div>
          ))}
        </div>
        </>
      )}
    </div>
  );
}
