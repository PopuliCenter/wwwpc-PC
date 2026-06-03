import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/services/api';
import { format } from 'date-fns';

interface Survey {
  id: string;
  title: string;
  status: 'draft' | 'active' | 'inactive' | 'archived';
  rewardMode: 'automatic' | 'manual';
  createdAt: string;
  startDate?: string;
  endDate?: string;
}

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800',
  active: 'bg-green-100 text-green-800',
  inactive: 'bg-yellow-100 text-yellow-800',
  archived: 'bg-red-100 text-red-800',
};

const statusLabels: Record<string, string> = {
  draft: 'Draft',
  active: 'Aktif',
  inactive: 'Nonaktif',
  archived: 'Diarsipkan',
};

export function SurveyListPage() {
  const [surveys, setSurveys] = useState<Survey[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

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

  const handleDeactivate = async (id: string) => {
    try {
      await api.patch(`/surveys/${id}`, { status: 'inactive' });
      fetchSurveys();
    } catch {
      alert('Gagal menonaktifkan survei');
    }
  };

  const handleArchive = async (id: string) => {
    try {
      await api.patch(`/surveys/${id}`, { status: 'archived' });
      fetchSurveys();
    } catch {
      alert('Gagal mengarsipkan survei');
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Manajemen Survei</h1>
        <button
          onClick={() => navigate('/admin/surveys/create')}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          + Buat Survei Baru
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Memuat...</div>
        ) : surveys.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            Belum ada survei. Klik "Buat Survei Baru" untuk memulai.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Judul</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reward</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Dibuat</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Aksi</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {surveys.map((survey) => (
                  <tr key={survey.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900 font-medium">{survey.title}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${statusColors[survey.status]}`}>
                        {statusLabels[survey.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 capitalize">{survey.rewardMode}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {format(new Date(survey.createdAt), 'dd/MM/yyyy')}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <div className="flex gap-2">
                        <button
                          onClick={() => navigate(`/admin/surveys/${survey.id}/edit`)}
                          className="text-blue-600 hover:text-blue-800"
                          title="Edit"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => handleDuplicate(survey.id)}
                          className="text-green-600 hover:text-green-800"
                          title="Duplikasi"
                        >
                          📋
                        </button>
                        <button
                          onClick={() => handleDeactivate(survey.id)}
                          className="text-yellow-600 hover:text-yellow-800"
                          title="Nonaktifkan"
                        >
                          ⏸️
                        </button>
                        <button
                          onClick={() => handleArchive(survey.id)}
                          className="text-gray-600 hover:text-gray-800"
                          title="Arsipkan"
                        >
                          📦
                        </button>
                        <button
                          onClick={() => handleDelete(survey.id)}
                          className="text-red-600 hover:text-red-800"
                          title="Hapus"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
