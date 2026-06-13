import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '@/services/api';

interface SurveyFormData {
  title: string;
  description: string;
  startDate: string;
  endDate: string;
  maxDurationMinutes: number;
  maxRespondents: number;
  rewardMode: 'automatic' | 'manual';
  rewardPoints: number;
  rewardDescription: string;
  formMode: 'paginated' | 'scroll' | 'wizard';
  surveyType: 'nasional' | 'daerah' | 'lainnya';
  category: string;
}

export function SurveyCreatePage() {
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<SurveyFormData>({
    title: '',
    description: '',
    startDate: '',
    endDate: '',
    maxDurationMinutes: 30,
    maxRespondents: 0,
    rewardMode: 'automatic',
    rewardPoints: 0,
    rewardDescription: '',
    formMode: 'paginated',
    surveyType: 'lainnya',
    category: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    setForm((prev) => ({
      ...prev,
      [name]: type === 'number' ? Number(value) : value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const result = await api.post<{ id: string }>('/surveys', {
        title: form.title,
        description: form.description || undefined,
        rewardMode: form.rewardMode,
        formMode: form.formMode,
        surveyType: form.surveyType,
        category: form.category || undefined,
        timeConfig: {
          startDatetime: form.startDate || undefined,
          endDatetime: form.endDate || undefined,
          maxDurationMinutes: form.maxDurationMinutes || undefined,
          maxRespondents: form.maxRespondents || undefined,
        },
        rewardConfig: {
          rewardMode: form.rewardMode,
          pointsValue: form.rewardPoints || undefined,
          manualRewardType: form.rewardDescription || undefined,
        },
      });
      navigate(`/admin/surveys/${result.id}/edit`);
    } catch (err: unknown) {
      const apiErr = err as { message?: string };
      setError(apiErr.message ?? 'Gagal membuat survei');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/admin/surveys')}
          className="text-gray-600 hover:text-gray-900"
        >
          ← Kembali
        </button>
        <h1 className="text-2xl font-bold text-gray-900">Buat Survei Baru</h1>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-6">
        <div>
          <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
            Judul Survei *
          </label>
          <input
            id="title"
            name="title"
            type="text"
            required
            value={form.title}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="Masukkan judul survei"
          />
        </div>

        <div>
          <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
            Deskripsi
          </label>
          <textarea
            id="description"
            name="description"
            rows={4}
            value={form.description}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            placeholder="Deskripsi survei"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="surveyType" className="block text-sm font-medium text-gray-700 mb-1">
              Tipe Survei
            </label>
            <select
              id="surveyType"
              name="surveyType"
              value={form.surveyType}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              <option value="nasional">Nasional</option>
              <option value="daerah">Daerah</option>
              <option value="lainnya">Lainnya</option>
            </select>
          </div>
          <div>
            <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-1">
              Kategori (tema)
            </label>
            <input
              id="category"
              name="category"
              type="text"
              list="survey-category-options"
              value={form.category}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Contoh: Politik, Ekonomi, Sosial"
            />
            <datalist id="survey-category-options">
              <option value="Politik" />
              <option value="Ekonomi" />
              <option value="Sosial" />
              <option value="Kesehatan" />
              <option value="Pendidikan" />
              <option value="Lingkungan" />
            </datalist>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="startDate" className="block text-sm font-medium text-gray-700 mb-1">
              Tanggal Mulai
            </label>
            <input
              id="startDate"
              name="startDate"
              type="datetime-local"
              value={form.startDate}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label htmlFor="endDate" className="block text-sm font-medium text-gray-700 mb-1">
              Tanggal Berakhir
            </label>
            <input
              id="endDate"
              name="endDate"
              type="datetime-local"
              value={form.endDate}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="maxDurationMinutes" className="block text-sm font-medium text-gray-700 mb-1">
              Durasi Maks (menit)
            </label>
            <input
              id="maxDurationMinutes"
              name="maxDurationMinutes"
              type="number"
              min={1}
              value={form.maxDurationMinutes}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label htmlFor="maxRespondents" className="block text-sm font-medium text-gray-700 mb-1">
              Maks Responden (0 = tak terbatas)
            </label>
            <input
              id="maxRespondents"
              name="maxRespondents"
              type="number"
              min={0}
              value={form.maxRespondents}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>

        <div>
          <label htmlFor="rewardMode" className="block text-sm font-medium text-gray-700 mb-1">
            Mode Reward
          </label>
          <select
            id="rewardMode"
            name="rewardMode"
            value={form.rewardMode}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="automatic">Otomatis</option>
            <option value="manual">Manual</option>
          </select>
        </div>

        <div>
          <label htmlFor="formMode" className="block text-sm font-medium text-gray-700 mb-1">
            Mode Tampilan Form
          </label>
          <select
            id="formMode"
            name="formMode"
            value={form.formMode}
            onChange={handleChange}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
          >
            <option value="paginated">Paginasi (beberapa pertanyaan per halaman)</option>
            <option value="scroll">Scroll (semua pertanyaan dalam satu halaman)</option>
            <option value="wizard">Wizard (satu pertanyaan per langkah)</option>
          </select>
          <p className="mt-1 text-xs text-gray-500">
            Mode <strong>wizard</strong> cocok untuk pengisian lapangan oleh surveyor.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="rewardPoints" className="block text-sm font-medium text-gray-700 mb-1">
              Poin Reward
            </label>
            <input
              id="rewardPoints"
              name="rewardPoints"
              type="number"
              min={0}
              value={form.rewardPoints}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
          <div>
            <label htmlFor="rewardDescription" className="block text-sm font-medium text-gray-700 mb-1">
              Deskripsi Reward
            </label>
            <input
              id="rewardDescription"
              name="rewardDescription"
              type="text"
              value={form.rewardDescription}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary-500"
              placeholder="Contoh: Pulsa 10rb"
            />
          </div>
        </div>

        <div className="flex gap-4 pt-4">
          <button
            type="submit"
            disabled={submitting}
            className="px-6 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 transition-colors"
          >
            {submitting ? 'Menyimpan...' : 'Buat Survei'}
          </button>
          <button
            type="button"
            onClick={() => navigate('/admin/surveys')}
            className="px-6 py-2 bg-gray-200 text-gray-700 rounded-md hover:bg-gray-300 transition-colors"
          >
            Batal
          </button>
        </div>
      </form>
    </div>
  );
}
