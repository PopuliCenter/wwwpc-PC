import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { api } from '@/services/api';
import { Button } from '@/components/common/Button';
import { Notice } from '@/components/common/Notice';
import { fieldCls, textareaCls } from '@/components/common/fieldStyles';

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

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>,
  ) => {
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
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0"
          onClick={() => navigate('/admin/surveys')}
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" /> Kembali
        </Button>
        <h1 className="min-w-0 text-2xl text-gray-900">Buat Survei Baru</h1>
      </div>

      {error && (
        <Notice tone="danger" role="alert">
          {error}
        </Notice>
      )}

      <form
        onSubmit={handleSubmit}
        className="space-y-6 rounded-xl border border-gray-200 bg-panel p-4 sm:p-6"
      >
        <div>
          <label htmlFor="title" className="mb-1 block text-xs font-medium text-gray-600">
            Judul Survei *
          </label>
          <input
            id="title"
            name="title"
            type="text"
            required
            value={form.title}
            onChange={handleChange}
            className={fieldCls}
            placeholder="Masukkan judul survei"
          />
        </div>

        <div>
          <label htmlFor="description" className="mb-1 block text-xs font-medium text-gray-600">
            Deskripsi
          </label>
          <textarea
            id="description"
            name="description"
            rows={4}
            value={form.description}
            onChange={handleChange}
            className={textareaCls}
            placeholder="Deskripsi survei"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="surveyType" className="mb-1 block text-xs font-medium text-gray-600">
              Tipe Survei
            </label>
            <select
              id="surveyType"
              name="surveyType"
              value={form.surveyType}
              onChange={handleChange}
              className={fieldCls}
            >
              <option value="nasional">Nasional</option>
              <option value="daerah">Daerah</option>
              <option value="lainnya">Lainnya</option>
            </select>
          </div>
          <div>
            <label htmlFor="category" className="mb-1 block text-xs font-medium text-gray-600">
              Kategori (tema)
            </label>
            <input
              id="category"
              name="category"
              type="text"
              list="survey-category-options"
              value={form.category}
              onChange={handleChange}
              className={fieldCls}
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
            <label htmlFor="startDate" className="mb-1 block text-xs font-medium text-gray-600">
              Tanggal Mulai
            </label>
            <input
              id="startDate"
              name="startDate"
              type="datetime-local"
              value={form.startDate}
              onChange={handleChange}
              className={fieldCls}
            />
          </div>
          <div>
            <label htmlFor="endDate" className="mb-1 block text-xs font-medium text-gray-600">
              Tanggal Berakhir
            </label>
            <input
              id="endDate"
              name="endDate"
              type="datetime-local"
              value={form.endDate}
              onChange={handleChange}
              className={fieldCls}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="maxDurationMinutes"
              className="mb-1 block text-xs font-medium text-gray-600"
            >
              Durasi Maks (menit)
            </label>
            <input
              id="maxDurationMinutes"
              name="maxDurationMinutes"
              type="number"
              min={1}
              value={form.maxDurationMinutes}
              onChange={handleChange}
              className={fieldCls}
            />
          </div>
          <div>
            <label
              htmlFor="maxRespondents"
              className="mb-1 block text-xs font-medium text-gray-600"
            >
              Kuota maks responden (0 = tak terbatas)
            </label>
            <input
              id="maxRespondents"
              name="maxRespondents"
              type="number"
              min={0}
              value={form.maxRespondents}
              onChange={handleChange}
              className={fieldCls}
            />
          </div>
        </div>

        <div>
          <label htmlFor="rewardMode" className="mb-1 block text-xs font-medium text-gray-600">
            Mode Reward
          </label>
          <select
            id="rewardMode"
            name="rewardMode"
            value={form.rewardMode}
            onChange={handleChange}
            className={fieldCls}
          >
            <option value="automatic">Otomatis (poin)</option>
            <option value="manual">Manual</option>
          </select>
        </div>

        <div>
          <label htmlFor="formMode" className="mb-1 block text-xs font-medium text-gray-600">
            Cara Menampilkan Pertanyaan
          </label>
          <select
            id="formMode"
            name="formMode"
            value={form.formMode}
            onChange={handleChange}
            className={fieldCls}
          >
            <option value="paginated">Per Halaman (beberapa pertanyaan per halaman)</option>
            <option value="scroll">Satu Halaman (gulir ke bawah)</option>
            <option value="wizard">Satu per Satu (1 pertanyaan tiap langkah)</option>
          </select>
          <p className="mt-1 text-xs text-gray-600">
            Pilihan <strong>Satu per Satu</strong> cocok untuk pengisian lapangan (satu pertanyaan
            per layar).
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label htmlFor="rewardPoints" className="mb-1 block text-xs font-medium text-gray-600">
              Poin Reward
            </label>
            <input
              id="rewardPoints"
              name="rewardPoints"
              type="number"
              min={0}
              value={form.rewardPoints}
              onChange={handleChange}
              className={fieldCls}
            />
          </div>
          <div>
            <label
              htmlFor="rewardDescription"
              className="mb-1 block text-xs font-medium text-gray-600"
            >
              Deskripsi Reward
            </label>
            <input
              id="rewardDescription"
              name="rewardDescription"
              type="text"
              value={form.rewardDescription}
              onChange={handleChange}
              className={fieldCls}
              placeholder="Contoh: Pulsa 10rb"
            />
          </div>
        </div>

        <div className="flex gap-3 pt-2">
          <Button type="submit" isLoading={submitting}>
            {submitting ? 'Menyimpan...' : 'Buat Survei'}
          </Button>
          <Button type="button" variant="secondary" onClick={() => navigate('/admin/surveys')}>
            Batal
          </Button>
        </div>
      </form>
    </div>
  );
}
