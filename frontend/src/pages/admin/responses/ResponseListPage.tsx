import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/services/api';
import { pollAndDownloadExport } from '@/utils/exportDownload';
import { format } from 'date-fns';

interface ResponseItem {
  id: string;
  respondentName: string;
  respondentPhone?: string | null;
  surveyTitle: string;
  status: 'completed' | 'partial' | 'abandoned';
  submittedAt: string;
  deviceType: string;
  surveyId: string;
  surveyType?: string;
  category?: string | null;
  rewardMode?: 'automatic' | 'manual';
  rewardType?: string | null;
  rewardDistributed?: boolean;
  destinationNumber?: string | null;
  duplicateFlag?: boolean;
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
  surveyType: string;
  category: string;
  search: string;
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
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6">
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
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Jenis</th>
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
                <td className="px-4 py-3 text-sm text-gray-600 capitalize">{r.rewardType ?? '-'}</td>
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
    surveyType: '',
    category: '',
    search: '',
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
      if (filters.surveyType) params.set('surveyType', filters.surveyType);
      if (filters.category) params.set('category', filters.category);
      if (filters.search) params.set('search', filters.search);

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

  const handleExport = async (fmt: 'csv' | 'excel' | 'pdf' | 'json') => {
    if (!filters.surveyId) {
      alert('Pilih survei dulu di filter untuk mengekspor data.');
      return;
    }
    try {
      const params = new URLSearchParams();
      params.set('surveyId', filters.surveyId);
      if (filters.startDate) params.set('startDate', filters.startDate);
      if (filters.endDate) params.set('endDate', filters.endDate);

      const job = await api.post<{ id: string }>(`/export/${fmt}?${params.toString()}`);
      await pollAndDownloadExport(job.id);
    } catch (e) {
      alert((e as Error).message || `Gagal export ${fmt.toUpperCase()}`);
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
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <h3 className="text-sm font-medium text-gray-700 mb-3">Filter</h3>
        <div className="mb-3">
          <input
            type="text"
            name="search"
            value={filters.search}
            onChange={handleFilterChange}
            placeholder="Cari nama atau nomor HP responden..."
            className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </div>
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
          <div>
            <label className="block text-xs text-gray-500 mb-1">Tipe Survei</label>
            <select
              name="surveyType"
              value={filters.surveyType}
              onChange={handleFilterChange}
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
            >
              <option value="">Semua</option>
              <option value="nasional">Nasional</option>
              <option value="daerah">Daerah</option>
              <option value="lainnya">Lainnya</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Kategori</label>
            <input
              type="text"
              name="category"
              value={filters.category}
              onChange={handleFilterChange}
              placeholder="Semua"
              className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
            />
          </div>
        </div>
        <button
          onClick={handleApplyFilters}
          className="mt-3 px-4 py-1.5 bg-primary-600 text-white text-sm rounded-md hover:bg-primary-700 transition-colors"
        >
          Terapkan Filter
        </button>
      </div>

      {/* Manual Reward Panel */}
      <ManualRewardPanel responses={responses} onMarkDistributed={handleMarkDistributed} />

      {/* Response Table */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
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
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reward</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Aksi</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {responses.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm text-gray-900">
                      <div className="flex items-center gap-2">
                        <span>{r.respondentName}</span>
                        {r.duplicateFlag && (
                          <span
                            className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700"
                            title="Nomor tujuan sama dipakai lebih dari satu respons"
                          >
                            Duplikat
                          </span>
                        )}
                      </div>
                      {r.respondentPhone && (
                        <span className="text-xs text-gray-400">{r.respondentPhone}</span>
                      )}
                    </td>
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
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {r.rewardMode === 'manual' ? (
                        r.destinationNumber ? (
                          <div>
                            <span className="capitalize">{r.rewardType ?? 'reward'}</span>
                            <span className="block text-xs text-gray-400">{r.destinationNumber}</span>
                            {r.rewardDistributed && (
                              <span className="text-xs text-emerald-600">sudah ditop-up</span>
                            )}
                          </div>
                        ) : (
                          <span className="text-xs text-gray-400">belum diisi</span>
                        )
                      ) : (
                        <span className="text-xs text-gray-400">otomatis</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <button
                        onClick={() => navigate(`/admin/responses/${r.id}`)}
                        className="text-primary-600 hover:text-primary-800"
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
