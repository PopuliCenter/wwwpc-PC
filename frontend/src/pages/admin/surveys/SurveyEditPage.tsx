import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { AlertCircle, ArrowLeft, BookOpen, Check, Plus, Shuffle } from 'lucide-react';
import { api } from '@/services/api';
import { showAppNotice } from '@/stores/notification.store';
import { getProvinces } from '@/utils/wilayah';
import {
  downloadQuestionTemplate,
  exportQuestions,
  parseQuestionsFile,
  type ImportedQuestion,
} from './questionImportExport';
import { takePendingImport } from './questionImportHandoff';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { Skeleton } from '@/components/common/Skeleton';
import { fieldCls, textareaCls } from '@/components/common/fieldStyles';
import type { QuestionType, Question, SurveyDetail, BackendQuestion } from './surveyEditTypes';
import { mapBackendQuestion, buildQuestionsFromImport } from './surveyEditTypes';
import { defaultsForType } from './questionTypeMeta';
import { InfoHint } from './questionConfigs';
import { SortableQuestionCard } from './SortableQuestionCard';
import { SurveyEditorHelp } from './SurveyEditorHelp';
import { RandomBlockPanel, findBlockConflicts, collectBlocks } from './RandomBlockPanel';

export function SurveyEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [survey, setSurvey] = useState<SurveyDetail | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  // Akordion: id pertanyaan yang sedang terbuka (hanya satu sekaligus).
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [blockPanelOpen, setBlockPanelOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ ok: boolean; text: string } | null>(null);
  // Informasi survei (bisa diedit seperti di buat survei) — penting untuk survei duplikat.
  const [settingsTitle, setSettingsTitle] = useState('');
  const [settingsDescription, setSettingsDescription] = useState('');
  const [settingsStartDate, setSettingsStartDate] = useState('');
  const [settingsEndDate, setSettingsEndDate] = useState('');
  const [settingsMaxDuration, setSettingsMaxDuration] = useState('');
  // Pengaturan survei (tipe, kategori, mode form)
  const [settingsType, setSettingsType] = useState<'nasional' | 'daerah' | 'lainnya'>('lainnya');
  const [settingsCategory, setSettingsCategory] = useState('');
  const [settingsFormMode, setSettingsFormMode] = useState<'paginated' | 'scroll' | 'wizard'>(
    'paginated',
  );
  // Reward — poin & deskripsi bisa diubah agar survei tidak mubazir bila salah set.
  const [settingsRewardMode, setSettingsRewardMode] = useState<'automatic' | 'manual'>('automatic');
  const [settingsRewardPoints, setSettingsRewardPoints] = useState('');
  const [settingsRewardDescription, setSettingsRewardDescription] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);
  // Alat pendukung (bukan tipe pertanyaan): rekam GPS & minta tanda tangan.
  const [settingsCaptureGps, setSettingsCaptureGps] = useState(false);
  const [settingsRequireSignature, setSettingsRequireSignature] = useState(false);
  const [settingsUppercaseAnswers, setSettingsUppercaseAnswers] = useState(false);
  // Limitasi & targeting survei
  const [settingsMaxRespondents, setSettingsMaxRespondents] = useState('');
  const [settingsAllowedGenders, setSettingsAllowedGenders] = useState<string[]>([]);
  const [settingsAllowedProvinces, setSettingsAllowedProvinces] = useState<string[]>([]);
  const [provinceList, setProvinceList] = useState<{ id: string; name: string }[]>([]);
  const [savingSettings, setSavingSettings] = useState(false);

  const saveSettings = async () => {
    setSavingSettings(true);
    setSaveMessage(null);
    try {
      await api.put(`/surveys/${id}`, {
        title: settingsTitle || undefined,
        description: settingsDescription || undefined,
        surveyType: settingsType,
        category: settingsCategory || undefined,
        formMode: settingsFormMode,
        rewardMode: settingsRewardMode,
        rewardConfig: {
          // rewardMode WAJIB ada di RewardConfigDto (validasi backend).
          rewardMode: settingsRewardMode,
          pointsValue: settingsRewardPoints !== '' ? Number(settingsRewardPoints) : undefined,
          manualRewardType: settingsRewardDescription || undefined,
        },
        captureGps: settingsCaptureGps,
        requireSignature: settingsRequireSignature,
        uppercaseAnswers: settingsUppercaseAnswers,
        allowedGenders: settingsAllowedGenders,
        allowedProvinces: settingsAllowedProvinces,
        timeConfig: {
          startDatetime: settingsStartDate || undefined,
          endDatetime: settingsEndDate || undefined,
          maxDurationMinutes: settingsMaxDuration ? Number(settingsMaxDuration) : undefined,
          maxRespondents: settingsMaxRespondents ? Number(settingsMaxRespondents) : 0,
        },
      });
      setSaveMessage({ ok: true, text: 'Pengaturan survei disimpan' });
    } catch (e) {
      // Tampilkan pesan asli dari server (mis. validasi) agar mudah didiagnosis.
      const msg = (e as { message?: string })?.message;
      setSaveMessage({
        ok: false,
        text: msg ? `Gagal menyimpan: ${msg}` : 'Gagal menyimpan pengaturan',
      });
    } finally {
      setSavingSettings(false);
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    const fetchSurvey = async () => {
      try {
        const [survey, rawQuestions] = await Promise.all([
          api.get<{
            id: string;
            title: string;
            description: string;
            surveyType?: 'nasional' | 'daerah' | 'lainnya';
            category?: string | null;
            formMode?: 'paginated' | 'scroll' | 'wizard';
            captureGps?: boolean;
            requireSignature?: boolean;
            uppercaseAnswers?: boolean;
            allowedGenders?: string[];
            allowedProvinces?: string[];
            maxRespondents?: number | null;
            startDatetime?: string | null;
            endDatetime?: string | null;
            maxDurationMinutes?: number | null;
            rewardMode?: 'automatic' | 'manual';
            rewardConfig?: {
              pointsValue?: number | null;
              manualRewardType?: string | null;
            } | null;
          }>(`/surveys/${id}`),
          api.get<BackendQuestion[]>(`/surveys/${id}/questions`),
        ]);
        const mapped = (rawQuestions ?? []).map(mapBackendQuestion);
        setSurvey({
          id: survey.id,
          title: survey.title,
          description: survey.description,
          surveyType: survey.surveyType ?? 'lainnya',
          category: survey.category ?? null,
          formMode: survey.formMode ?? 'paginated',
          captureGps: survey.captureGps ?? false,
          requireSignature: survey.requireSignature ?? false,
          questions: mapped,
        });
        setSettingsTitle(survey.title ?? '');
        setSettingsDescription(survey.description ?? '');
        // ISO → format input datetime-local (YYYY-MM-DDTHH:mm).
        setSettingsStartDate(survey.startDatetime ? survey.startDatetime.slice(0, 16) : '');
        setSettingsEndDate(survey.endDatetime ? survey.endDatetime.slice(0, 16) : '');
        setSettingsMaxDuration(
          survey.maxDurationMinutes != null ? String(survey.maxDurationMinutes) : '',
        );
        setSettingsType(survey.surveyType ?? 'lainnya');
        setSettingsCategory(survey.category ?? '');
        setSettingsFormMode(survey.formMode ?? 'paginated');
        setSettingsAllowedGenders(survey.allowedGenders ?? []);
        setSettingsAllowedProvinces(survey.allowedProvinces ?? []);
        setSettingsMaxRespondents(survey.maxRespondents ? String(survey.maxRespondents) : '');
        setSettingsCaptureGps(survey.captureGps ?? false);
        setSettingsRequireSignature(survey.requireSignature ?? false);
        setSettingsUppercaseAnswers(survey.uppercaseAnswers ?? false);
        setSettingsRewardMode(survey.rewardMode ?? 'automatic');
        setSettingsRewardPoints(
          survey.rewardConfig?.pointsValue != null ? String(survey.rewardConfig.pointsValue) : '',
        );
        setSettingsRewardDescription(survey.rewardConfig?.manualRewardType ?? '');
        setQuestions(mapped);
      } catch {
        showAppNotice({ title: 'Gagal memuat survei', tone: 'error' });
        navigate('/admin/surveys');
      } finally {
        setLoading(false);
      }
    };
    fetchSurvey();
  }, [id, navigate]);

  // Daftar provinsi untuk targeting wilayah (data lokal).
  useEffect(() => {
    getProvinces()
      .then(setProvinceList)
      .catch(() => {});
  }, []);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setQuestions((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex).map((q, idx) => ({ ...q, order: idx }));
      });
    }
  };

  const addQuestion = (type: QuestionType) => {
    const newQ: Question = {
      id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type,
      text: '',
      required: false,
      enabled: true,
      order: questions.length,
      ...defaultsForType(type),
    };
    setQuestions((prev) => [...prev, newQ]);
    // Buka pertanyaan baru di modal & tutup yang lain (hanya satu terbuka).
    setExpandedId(newQ.id);
  };

  // ─── Impor / ekspor pertanyaan (Excel) ─────────────────────────────────────
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const handleExportQuestions = async () => {
    if (questions.length === 0) {
      showAppNotice({ title: 'Belum ada pertanyaan untuk diunduh.', tone: 'info' });
      return;
    }
    try {
      await exportQuestions(questions, settingsTitle || survey?.title || 'survei');
    } catch {
      showAppNotice({ title: 'Gagal mengunduh pertanyaan.', tone: 'error' });
    }
  };

  const handleDownloadTemplate = async () => {
    try {
      await downloadQuestionTemplate();
    } catch {
      showAppNotice({ title: 'Gagal mengunduh template.', tone: 'error' });
    }
  };

  /** Tambahkan pertanyaan hasil impor ke bawah daftar (order lanjut) + notifikasi. */
  const appendImported = useCallback((imported: ImportedQuestion[], skipped: number) => {
    setQuestions((prev) => [...prev, ...buildQuestionsFromImport(imported, prev.length)]);
    showAppNotice({
      title: `${imported.length} pertanyaan diimpor.`,
      body:
        (skipped ? `${skipped} baris dilewati/dicatat. ` : '') +
        'Tinjau lalu klik Simpan untuk menyimpan.',
      tone: 'success',
    });
  }, []);

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // reset agar file sama bisa dipilih lagi
    if (!file) return;
    try {
      const { questions: imported, errors } = await parseQuestionsFile(file);
      if (imported.length === 0) {
        showAppNotice({
          title: 'Tidak ada pertanyaan yang diimpor.',
          body: errors[0] ?? undefined,
          tone: 'error',
        });
        return;
      }
      appendImported(imported, errors.length);
    } catch {
      showAppNotice({
        title: 'Gagal membaca file.',
        body: 'Pastikan format .xlsx sesuai template.',
        tone: 'error',
      });
    }
  };

  // Titipan impor dari halaman DAFTAR survei: setelah pertanyaan awal dimuat,
  // ambil (sekali) & tambahkan untuk ditinjau. Dijalankan saat loading selesai.
  useEffect(() => {
    if (loading || !id) return;
    const pending = takePendingImport(id);
    if (pending && pending.length) appendImported(pending, 0);
  }, [loading, id, appendImported]);

  const editQuestion = useCallback((updated: Question) => {
    setQuestions((prev) => prev.map((q) => (q.id === updated.id ? updated : q)));
  }, []);

  const deleteQuestion = useCallback((qId: string) => {
    setQuestions((prev) =>
      prev.filter((q) => q.id !== qId).map((q, idx) => ({ ...q, order: idx })),
    );
  }, []);

  const duplicateQuestion = useCallback(
    (q: Question) => {
      const copy: Question = {
        ...q,
        id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        order: questions.length,
        skipLogicRules: [],
        visibilityRules: [],
      };
      setQuestions((prev) => [...prev, copy]);
    },
    [questions.length],
  );

  const blockCount = collectBlocks(questions).length;

  const persistQuestions = async (successText: string) => {
    // Cegat bentrok blok acak vs aturan logika di sini agar admin dapat pesan
    // yang menyebut nomor pertanyaan; backend tetap memvalidasi ulang.
    const conflicts = findBlockConflicts(questions);
    if (conflicts.length > 0) {
      setSaveMessage({ ok: false, text: `Blok acak bentrok: ${conflicts[0]}` });
      setBlockPanelOpen(true);
      return;
    }

    setSaving(true);
    setSaveMessage(null);
    try {
      const payload = questions.map((q, idx) => ({
        // clientId = id-builder; backend memetakannya ke id DB baru untuk aturan.
        clientId: q.id,
        type: q.type,
        text: q.text ?? '',
        required: !!q.required,
        enabled: q.enabled !== false,
        order: idx,
        hasOtherOption: !!q.hasOtherOption,
        randomizeGroup: q.randomizeGroup?.trim() || null,
        pinPosition: !!q.pinPosition,
        options: (q.options ?? []).map((o, i) => ({
          label: o.label,
          value: o.value || o.label,
          orderIndex: i,
        })),
        validationRules: q.validationRules ?? null,
        skipLogicRules: (q.skipLogicRules ?? []).map((r) => ({
          sourceQuestionId: r.sourceQuestionId,
          operator: r.operator,
          conditionValue: r.conditionValue,
          action: r.action,
          targetQuestionId: r.targetQuestionId ?? null,
        })),
        visibilityRules: (q.visibilityRules ?? []).map((r) => ({
          sourceQuestionId: r.sourceQuestionId,
          operator: r.operator,
          conditionValue: r.conditionValue,
          visibilityAction: r.visibilityAction,
        })),
      }));
      await api.put(`/surveys/${id}/questions`, { questions: payload });
      setSaveMessage({ ok: true, text: successText });
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err: unknown) {
      const e = err as { message?: string | string[] };
      const msg = Array.isArray(e.message) ? e.message.join(', ') : e.message;
      setSaveMessage({ ok: false, text: msg || 'Gagal menyimpan survei' });
    } finally {
      setSaving(false);
    }
  };

  const handleSave = () => persistQuestions('Survei berhasil disimpan');

  // Tutup modal editor + simpan otomatis ke server (agar tak hilang).
  const closeEditor = () => {
    setExpandedId(null);
    void persistQuestions('Tersimpan otomatis');
  };

  if (loading) {
    // Kerangka sebentuk halaman editor: judul, dua panel pengaturan, daftar pertanyaan.
    return (
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-8 w-2/3 max-w-md" />
        <Card className="space-y-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-11 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </Card>
        <Card className="space-y-4">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-11 w-full rounded-lg" />
        </Card>
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-20 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <SurveyEditorHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="shrink-0"
            onClick={() => navigate('/admin/surveys')}
          >
            <ArrowLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" /> Kembali
          </Button>
          <h1 className="min-w-0 truncate text-2xl text-gray-900" title={survey?.title}>
            Edit: {survey?.title}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {saveMessage && (
            <span
              role="status"
              className={`inline-flex items-center gap-1.5 text-sm ${
                saveMessage.ok ? 'text-success-fg' : 'text-danger-fg'
              }`}
            >
              {saveMessage.ok ? (
                <Check className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
              )}
              {saveMessage.text}
            </span>
          )}
          <Button
            type="button"
            variant="secondary"
            onClick={() => setHelpOpen(true)}
            title="Panduan: percabangan, skip & kelompok eksperimen"
          >
            <BookOpen className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" /> Panduan
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => navigate(`/admin/surveys/${id}/preview`)}
          >
            Pratinjau
          </Button>
          <Button type="button" onClick={handleSave} isLoading={saving}>
            {saving ? 'Menyimpan...' : 'Simpan'}
          </Button>
        </div>
      </div>

      {/* Informasi Survei — judul, deskripsi, jadwal (bisa diedit, mis. survei duplikat) */}
      <Card>
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Informasi Survei</h2>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Judul Survei</label>
            <input
              type="text"
              value={settingsTitle}
              onChange={(e) => setSettingsTitle(e.target.value)}
              placeholder="Masukkan judul survei"
              className={fieldCls}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Deskripsi</label>
            <textarea
              value={settingsDescription}
              onChange={(e) => setSettingsDescription(e.target.value)}
              placeholder="Deskripsi survei"
              rows={3}
              className={textareaCls}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Tanggal Mulai</label>
              <input
                type="datetime-local"
                value={settingsStartDate}
                onChange={(e) => setSettingsStartDate(e.target.value)}
                className={fieldCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Tanggal Berakhir
              </label>
              <input
                type="datetime-local"
                value={settingsEndDate}
                onChange={(e) => setSettingsEndDate(e.target.value)}
                className={fieldCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Durasi Maks (menit)
              </label>
              <input
                type="number"
                min={0}
                value={settingsMaxDuration}
                onChange={(e) => setSettingsMaxDuration(e.target.value)}
                placeholder="mis. 30"
                className={fieldCls}
              />
            </div>
          </div>
        </div>
      </Card>

      {/* Pengaturan Survei */}
      <Card>
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Pengaturan Survei</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Tipe Survei</label>
            <select
              value={settingsType}
              onChange={(e) => setSettingsType(e.target.value as typeof settingsType)}
              className={fieldCls}
            >
              <option value="nasional">Nasional</option>
              <option value="daerah">Daerah</option>
              <option value="lainnya">Lainnya</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Kategori (tema)</label>
            <input
              type="text"
              list="survey-category-options"
              value={settingsCategory}
              onChange={(e) => setSettingsCategory(e.target.value)}
              placeholder="Contoh: Politik, Ekonomi"
              className={fieldCls}
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
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Cara Menampilkan Pertanyaan
              <InfoHint text="Mengatur bagaimana pertanyaan muncul ke responden: per halaman, semua sekaligus, atau satu per satu." />
            </label>
            <select
              value={settingsFormMode}
              onChange={(e) => setSettingsFormMode(e.target.value as typeof settingsFormMode)}
              className={fieldCls}
            >
              <option value="paginated">Per Halaman (beberapa pertanyaan per halaman)</option>
              <option value="scroll">Satu Halaman (gulir ke bawah)</option>
              <option value="wizard">Satu per Satu (1 pertanyaan tiap langkah)</option>
            </select>
          </div>
        </div>

        {/* Reward — poin & deskripsi dapat diubah agar survei tidak mubazir */}
        <div className="mt-4 border-t border-gray-100 pt-4">
          <p className="mb-2 text-sm font-medium text-gray-700">
            Reward
            <InfoHint text="Hadiah untuk responden yang menyelesaikan survei. Bisa diubah kapan saja, termasuk setelah survei dibuat." />
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Mode Reward</label>
              <select
                value={settingsRewardMode}
                onChange={(e) => setSettingsRewardMode(e.target.value as typeof settingsRewardMode)}
                className={fieldCls}
              >
                <option value="automatic">Otomatis (poin)</option>
                <option value="manual">Manual</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Poin Reward</label>
              <input
                type="number"
                min={0}
                value={settingsRewardPoints}
                onChange={(e) => setSettingsRewardPoints(e.target.value)}
                placeholder="mis. 500"
                className={fieldCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Deskripsi Reward
              </label>
              <input
                type="text"
                value={settingsRewardDescription}
                onChange={(e) => setSettingsRewardDescription(e.target.value)}
                placeholder="mis. Pulsa 5rb / e-wallet"
                className={fieldCls}
              />
            </div>
          </div>
        </div>

        {/* Alat pendukung — bukan tipe pertanyaan, melainkan setelan survei */}
        <div className="mt-4 border-t border-gray-100 pt-4">
          <p className="mb-2 text-sm font-medium text-gray-700">
            Fitur Tambahan
            <InfoHint text="Fitur opsional yang berlaku untuk seluruh survei, mis. merekam lokasi GPS atau meminta tanda tangan." />
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 p-3 hover:bg-gray-50">
              <input
                type="checkbox"
                checked={settingsCaptureGps}
                onChange={(e) => setSettingsCaptureGps(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-primary-600"
              />
              <span className="text-sm">
                <span className="block font-medium text-gray-800">Rekam lokasi GPS</span>
                <span className="block text-xs text-gray-600">
                  Tangkap koordinat otomatis di awal &amp; akhir pengisian.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 p-3 hover:bg-gray-50">
              <input
                type="checkbox"
                checked={settingsRequireSignature}
                onChange={(e) => setSettingsRequireSignature(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-primary-600"
              />
              <span className="text-sm">
                <span className="block font-medium text-gray-800">Tanda tangan responden</span>
                <span className="block text-xs text-gray-600">
                  Minta tanda tangan di akhir sebagai verifikasi/persetujuan.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-gray-200 p-3 hover:bg-gray-50">
              <input
                type="checkbox"
                checked={settingsUppercaseAnswers}
                onChange={(e) => setSettingsUppercaseAnswers(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-primary-600"
              />
              <span className="text-sm">
                <span className="block font-medium text-gray-800">
                  Huruf besar semua jawaban teks
                </span>
                <span className="block text-xs text-gray-600">
                  Jawaban teks &amp; isian responden otomatis jadi HURUF BESAR.
                </span>
              </span>
            </label>
          </div>
        </div>

        {/* Limitasi & Targeting */}
        <div className="mt-4 border-t border-gray-100 pt-4">
          <p className="mb-2 text-sm font-medium text-gray-700">Limitasi &amp; Targeting</p>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Kuota maks responden
              </label>
              <input
                type="number"
                min={0}
                value={settingsMaxRespondents}
                onChange={(e) => setSettingsMaxRespondents(e.target.value)}
                placeholder="0 = tak terbatas"
                className={fieldCls}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Khusus jenis kelamin
              </label>
              <div className="flex flex-wrap gap-x-3 lg:pt-1.5">
                {[
                  { v: 'male', l: 'Laki-laki' },
                  { v: 'female', l: 'Perempuan' },
                  { v: 'other', l: 'Lainnya' },
                ].map((g) => (
                  <label
                    key={g.v}
                    className="inline-flex min-h-11 items-center gap-1.5 text-sm lg:min-h-0"
                  >
                    <input
                      type="checkbox"
                      checked={settingsAllowedGenders.includes(g.v)}
                      onChange={(e) =>
                        setSettingsAllowedGenders((prev) =>
                          e.target.checked ? [...prev, g.v] : prev.filter((x) => x !== g.v),
                        )
                      }
                      className="h-4 w-4 shrink-0 accent-primary-600"
                    />
                    {g.l}
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs text-gray-500">Kosong = semua jenis kelamin.</p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Khusus provinsi{' '}
                {settingsAllowedProvinces.length > 0 && `(${settingsAllowedProvinces.length})`}
              </label>
              <div className="max-h-44 overflow-y-auto rounded-lg border border-gray-200 p-2 lg:max-h-32">
                {provinceList.length === 0 && (
                  <p className="text-xs text-gray-500">Memuat provinsi…</p>
                )}
                {provinceList.map((p) => (
                  <label
                    key={p.id}
                    className="flex min-h-11 items-center gap-1.5 py-0.5 text-sm lg:min-h-0 lg:text-xs"
                  >
                    <input
                      type="checkbox"
                      checked={settingsAllowedProvinces.includes(p.name)}
                      onChange={(e) =>
                        setSettingsAllowedProvinces((prev) =>
                          e.target.checked ? [...prev, p.name] : prev.filter((x) => x !== p.name),
                        )
                      }
                      className="h-4 w-4 shrink-0 accent-primary-600"
                    />
                    {p.name}
                  </label>
                ))}
              </div>
              <p className="mt-1 text-xs text-gray-500">Kosong = semua wilayah.</p>
            </div>
          </div>
        </div>

        <div className="mt-3">
          <Button
            type="button"
            variant="secondary"
            onClick={saveSettings}
            isLoading={savingSettings}
          >
            {savingSettings ? 'Menyimpan...' : 'Simpan Pengaturan'}
          </Button>
        </div>
      </Card>

      {/* Builder */}
      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-gray-900">Pertanyaan ({questions.length})</h2>
          <div className="flex flex-wrap items-center gap-2">
            <input
              ref={importInputRef}
              type="file"
              accept=".xlsx"
              onChange={handleImportFile}
              className="hidden"
            />
            <Button
              type="button"
              variant="secondary"
              onClick={handleDownloadTemplate}
              title="Unduh contoh format Excel untuk diisi"
            >
              Template
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={handleExportQuestions}
              title="Unduh pertanyaan survei ini ke Excel"
            >
              Unduh
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => importInputRef.current?.click()}
              title="Unggah pertanyaan dari file Excel (ditambahkan di bawah)"
            >
              Unggah
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setBlockPanelOpen(true)}
              title="Atur blok pengacakan urutan pertanyaan"
            >
              <Shuffle className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
              <span className="tabular-nums">
                Blok Acak{blockCount > 0 ? ` (${blockCount})` : ''}
              </span>
            </Button>
            <Button type="button" onClick={() => addQuestion('single_choice')}>
              <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" /> Tambah Pertanyaan
            </Button>
          </div>
        </div>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext
            items={questions.map((q) => q.id)}
            strategy={verticalListSortingStrategy}
          >
            {questions.map((question, idx) => (
              <SortableQuestionCard
                key={question.id}
                question={question}
                index={idx}
                onEdit={editQuestion}
                onDelete={deleteQuestion}
                onDuplicate={duplicateQuestion}
                allQuestions={questions}
                expanded={expandedId === question.id}
                onOpen={() => setExpandedId(question.id)}
                onClose={closeEditor}
              />
            ))}
          </SortableContext>
        </DndContext>

        {questions.length === 0 && (
          <div className="py-10 text-center text-sm text-gray-600">
            Belum ada pertanyaan. Klik &ldquo;Tambah Pertanyaan&rdquo; di atas.
          </div>
        )}

        {blockPanelOpen && (
          <RandomBlockPanel
            questions={questions}
            onApply={(updater) => setQuestions((prev) => prev.map(updater))}
            onClose={() => setBlockPanelOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
