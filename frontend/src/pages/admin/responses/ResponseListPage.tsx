import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/services/api';
import { format } from 'date-fns';

interface ResponseItem {
  id: string;
  respondentName: string;
  surveyTitle: string;
  status: 'completed' | 'partial' | 'abandoned';
  submittedAt: string;
  deviceType: string;
  surveyId: string;
  rewardMode?: 'automatic' | 'manual';
  rewardDistributed?: boolean;
  destinationNumber?: string;
}

interface SurveyOption {
  id: string;
  title: string;
  rewardMode: 'automatic' | 'manual';
}

interface FilterState {
  startDate: string;
  endDate: string;
  region: string;
  status: string;
  deviceType: string;
  surveyId: string;
}

const statusColors: Record<string, string> = {
  completed: 'bg-green-100 text-green-800',
  partial: 'bg-yellow-100 text-yellow-800',
  abandoned: 'bg-red-100 text-red-800',
};

const statusLabels: Record<string, string> = {
  completed: 'Selesai',
  partial: 'Sebagian',
  abandoned: 'Ditinggalkan',
};

function ManualRewardPanel({
  responses,
  onMarkDistributed,
}: {
  responses: ResponseItem[];
  onMarkDistributed: (ids: string[]) => void;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const eligibleResponses = responses.filter(
    (r) => r.rewardMode === 'manual' && r.status === 'completed' && !r.rewardDistributed
  );

  if (eligibleResponses.length === 0) return null;

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const toggleAll = () => {
    if (selectedIds.length === eligibleResponses.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(eligibleResponses.map((r) => r.id));
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        Distribusi Reward Manual ({eligibleResponses.length} menunggu)
      </h3>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left">
                <input
                  type="checkbox"
                  checked={selectedIds.length === eligibleResponses.length && eligibleResponses.length > 0}
                  onChange={toggleAll}
                  className="rounded border-gray-300"
                />
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Responden</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Survei</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">No. Tujuan</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tanggal</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {eligibleResponses.map((r) => (
              <tr key={r.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(r.id)}
                    onChange={() => toggleSelect(r.id)}
                    className="rounded border-gray-300"
                  />
                </td>
                <td className="px-4 py-3 text-sm text-gray-900">{r.respondentName}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{r.surveyTitle}</td>
                <td className="px-4 py-3 text-sm text-gray-600">{r.destinationNumber ?? '-'}</td>
                <td className="px-4 py-3 text-sm text-gray-600">
                  {format(new Date(r.submittedAt), 'dd/MM/yyyy HH:mm')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {selectedIds.length > 0 && (
        <div className="mt-4 flex items-center gap-4">
          <span className="text-sm text-gray-600">{selectedIds.length} dipilih</span>
          <button
            onClick={() => {
              onMarkDistributed(selectedIds);
              setSelectedIds([]);
            }}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 transition-colors"
          >
            ✓ Tandai Sudah Didistribusikan
          </button>
        </div>
      )}
    </div>
  );
}

export function ResponseListPage() {
  const navigate = useNavigate();
  const [responses, setResponses] = useState<ResponseItem[]>([]);
  const [surveys, setSurveys] = useState<SurveyOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<FilterState>({
    startDate: '',
    endDate: '',
    region: '',
    status: '',
    deviceType: '',
    surveyId: '',
  });

  const fetchResponses = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.startDate) params.set('startDate', filters.startDate);
      if (filters.endDate) params.set('endDate', filters.endDate);
      if (filters.region) params.set('region', filters.region);
      if (filters.status) params.set('status', filters.status);
      if (filters.deviceType) params.set('deviceType', filters.deviceType);
      if (filters.surveyId) params.set('surveyId', filters.surveyId);

      const query = params.toString();
      const result = await api.get<ResponseItem[]>(`/responses${query ? `?${query}` : ''}`);
      setResponses(result);
    } catch {
      setResponses([]);
    } finally {
      setLoading(false);
    }
  };

  const fetchSurveys = async () => {
    try {
      const result = await api.get<SurveyOption[]>('/surveys');
      setSurveys(result);
    } catch {
      setSurveys([]);
    }
  };

  useEffect(() => {
    fetchSurveys();
    fetchResponses();
  }, []);

  const handleFilterChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFilters((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleApplyFilters = () => {
    fetchResponses();
  };

  const handleExport = async (format: 'csv' | 'excel' | 'pdf' | 'json') => {
    try {
      const params = new URLSearchParams();
      if (filters.surveyId) params.set('surveyId', filters.surveyId);
      if (filters.startDate) params.set('startDate', filters.startDate);
      if (filters.endDate) params.set('endDate', filters.endDate);

      await api.post(`/export/${format}?${params.toString()}`);
      alert(`Export ${format.toUpperCase()} berhasil dimulai. File akan tersedia segera.`);
    } catch {
      alert(`Gagal export ${format.toUpperCase()}`);
    }
  };

  const handleMarkDistributed = async (ids: string[]) => {
    try {
      await api.post('/rewards/mark-distributed', { responseIds: ids });
      fetchResponses();
    } catch {
      alert('Gagal menandai reward');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900">Manajemen Respons</h1>
        <div className="flex gap-2">
          <button
            onClick={() => handleExport('csv')}
            className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
          >
            CSV
          </button>
          <button
            onClick={() => handleExport('excel')}
            className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
          >
            Excel
          </button>
          <button
            onClick={() => handleExport('pdf')}
            className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
          >
            PDF
          </button>
          <button
            onClick={() => handleExport('json')}
            className="px-3 py-1.5 text-sm bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200"
          >
            JSON
          </button>
        </div>
      </div>

      {/* Filter Panel */}
      <div className="bg-white rounded-lg shadow p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Filter</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Dari Tanggal</label>
            <input
              type="date"
              name="startDate"
              value={filters.startDate}
              onChange={handleFilterChange}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Sampai Tanggal</label>
            <input
              type="date"
              name="endDate"
              value={filters.endDate}
              onChange={handleFilterChange}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Wilayah</label>
            <input
              type="text"
              name="region"
              value={filters.region}
              onChange={handleFilterChange}
              placeholder="Semua"
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Status</label>
            <select
              name="status"
              value={filters.status}
              onChange={handleFilterChange}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
            >
              <option value="">Semua</option>
              <option value="completed">Selesai</option>
              <option value="partial">Sebagian</option>
              <option value="abandoned">Ditinggalkan</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Perangkat</label>
            <select
              name="deviceType"
              value={filters.deviceType}
              onChange={handleFilterChange}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
            >
              <option value="">Semua</option>
              <option value="mobile">Mobile</option>
              <option value="desktop">Desktop</option>
              <option value="tablet">Tablet</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Survei</label>
            <select
              name="surveyId"
              value={filters.surveyId}
              onChange={handleFilterChange}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
            >
              <option value="">Semua</option>
              {surveys.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button
          onClick={handleApplyFilters}
          className="mt-3 px-4 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700 transition-colors"
        >
          Terapkan Filter
        </button>
      </div>

      {/* Manual Reward Panel */}
      <ManualRewardPanel responses={responses} onMarkDistributed={handleMarkDistributed} />

      {/* Response Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">Memuat...</div>
        ) : responses.length === 0 ? (
          <div className="p-8 text-center text-gray-500">Tidak ada respons ditemukan.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Responden</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Survei</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tanggal</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Perangkat</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Aksi</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {responses.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">{r.respondentName}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">{r.surveyTitle}</td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${statusColors[r.status]}`}>
                        {statusLabels[r.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {format(new Date(r.submittedAt), 'dd/MM/yyyy HH:mm')}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 capitalize">{r.deviceType}</td>
                    <td className="px-4 py-3 text-sm">
                      <button
                        onClick={() => navigate(`/admin/responses/${r.id}`)}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        Detail
                      </button>
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
