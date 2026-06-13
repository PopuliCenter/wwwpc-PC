import { useState, useEffect, useCallback } from 'react';
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
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { api } from '@/services/api';

// ─── Types (aligned dengan backend QuestionType enum) ─────────────────────────
type QuestionType =
  | 'single_choice'
  | 'multiple_choice'
  | 'short_text'
  | 'long_text'
  | 'phone_number'
  | 'numeric_scale'
  | 'dropdown'
  | 'matrix_likert'
  | 'file_upload'
  | 'date_time'
  | 'date'
  | 'rating_scale'
  | 'unique_id'
  | 'indonesia_region'
  | 'signature'
  | 'photo'
  | 'gps'
  | 'audio';

interface QuestionOption {
  id: string;
  label: string;
  value: string;
  order: number;
}

type ConditionOperator = 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than';

interface SkipLogicRule {
  sourceQuestionId: string;
  operator: ConditionOperator;
  conditionValue: string;
  action: 'skip' | 'jump_to';
  targetQuestionId?: string;
}

interface VisibilityRule {
  sourceQuestionId: string;
  operator: ConditionOperator;
  conditionValue: string;
  visibilityAction: 'show' | 'hide';
}

interface ValidationRules {
  // Teks
  minLength?: number;
  maxLength?: number;
  emailFormat?: boolean;
  phoneFormat?: boolean;
  regex?: string;
  // Numeric
  numericRange?: { min?: number; max?: number };
  // Pilihan
  maxCheckbox?: number;
  minCheckbox?: number;
  // Matrix
  matrixRows?: string[];
  matrixColumns?: string[];
  // Rating Scale
  ratingMax?: number;
  ratingDisplayMode?: 'star' | 'number';
  ratingMinLabel?: string;
  ratingMaxLabel?: string;
  // Wilayah
  regionDepth?: 'province' | 'regency' | 'district' | 'village';
  lockedProvince?: { id: string; name: string } | null;
  lockedRegency?: { id: string; name: string } | null;
  // Misc
  description?: string;
  scaleMin?: number;
  scaleMax?: number;
}

interface Question {
  id: string;
  type: QuestionType;
  text: string;
  required: boolean;
  /** true=tampil, false=nonaktif (tidak ditampilkan ke responden). Default true. */
  enabled?: boolean;
  order: number;
  hasOtherOption?: boolean;
  options?: QuestionOption[];
  skipLogicRules?: SkipLogicRule[];
  visibilityRules?: VisibilityRule[];
  validationRules?: ValidationRules;
}

interface SurveyDetail {
  id: string;
  title: string;
  description: string;
  surveyType: 'nasional' | 'daerah' | 'lainnya';
  category: string | null;
  formMode: 'paginated' | 'scroll' | 'wizard';
  questions: Question[];
}

// Bentuk pertanyaan dari backend (GET /surveys/:id/questions)
interface BackendQuestion {
  id: string;
  type: QuestionType;
  questionText: string;
  required: boolean;
  enabled?: boolean;
  orderIndex: number;
  validationRules: ValidationRules | null;
  hasOtherOption: boolean;
  options?: { id: string; label: string; value: string; orderIndex: number }[];
}

function mapBackendQuestion(q: BackendQuestion, idx: number): Question {
  return {
    id: q.id,
    type: q.type,
    text: q.questionText ?? '',
    required: !!q.required,
    enabled: q.enabled !== false,
    order: q.orderIndex ?? idx,
    hasOtherOption: !!q.hasOtherOption,
    validationRules: q.validationRules ?? undefined,
    options: (q.options ?? [])
      .slice()
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((o) => ({ id: o.id, label: o.label, value: o.value, order: o.orderIndex })),
  };
}

// ─── Metadata tipe pertanyaan ─────────────────────────────────────────────────
const questionTypeLabels: Record<QuestionType, string> = {
  single_choice: 'Pilihan Tunggal',
  multiple_choice: 'Pilihan Ganda',
  short_text: 'Teks Pendek',
  long_text: 'Teks Panjang',
  phone_number: 'No. Telepon',
  numeric_scale: 'Skala Numerik',
  dropdown: 'Dropdown',
  matrix_likert: 'Matriks / Likert',
  file_upload: 'Upload File',
  date_time: 'Tanggal & Waktu',
  date: 'Tanggal',
  rating_scale: 'Skala Rating',
  unique_id: 'ID Unik',
  indonesia_region: 'Wilayah Indonesia',
  signature: 'Tanda Tangan',
  photo: 'Foto (Kamera)',
  gps: 'Titik GPS',
  audio: 'Rekaman Audio',
};

const operatorLabels: Record<ConditionOperator, string> = {
  equals: 'sama dengan (=)',
  not_equals: 'tidak sama dengan (≠)',
  contains: 'mengandung kata',
  greater_than: 'lebih besar dari (>)',
  less_than: 'lebih kecil dari (<)',
};

// ─── Komponen konfigurasi per tipe ───────────────────────────────────────────

function ChoiceConfig({
  question,
  onEdit,
}: {
  question: Question;
  onEdit: (q: Question) => void;
}) {
  const options = question.options ?? [];

  return (
    <div className="space-y-2">
      <label className="block text-xs font-medium text-gray-600">Opsi Jawaban</label>
      {options.map((opt, idx) => (
        <div key={opt.id} className="flex items-center gap-2">
          <span className="text-gray-400 text-xs w-5">{idx + 1}.</span>
          <input
            type="text"
            value={opt.label}
            onChange={(e) => {
              const next = [...options];
              next[idx] = { ...opt, label: e.target.value, value: e.target.value.toLowerCase().replace(/\s+/g, '_') };
              onEdit({ ...question, options: next });
            }}
            className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
            placeholder={`Opsi ${idx + 1}`}
          />
          <button
            onClick={() => onEdit({ ...question, options: options.filter((_, i) => i !== idx) })}
            className="text-red-400 hover:text-red-600 text-sm px-1"
            title="Hapus opsi"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        onClick={() => {
          const newOpt: QuestionOption = {
            id: `opt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            label: '',
            value: `option_${options.length + 1}`,
            order: options.length,
          };
          onEdit({ ...question, options: [...options, newOpt] });
        }}
        className="text-primary-600 text-sm hover:text-primary-800 mt-1 flex items-center gap-1"
      >
        + Tambah Opsi
      </button>
      <div className="flex items-center gap-2 mt-2 pt-2 border-t border-gray-100">
        <input
          type="checkbox"
          id={`other-${question.id}`}
          checked={question.hasOtherOption ?? false}
          onChange={(e) => onEdit({ ...question, hasOtherOption: e.target.checked })}
          className="rounded border-gray-300"
        />
        <label htmlFor={`other-${question.id}`} className="text-xs text-gray-600">
          Tambah opsi "Lainnya" (teks bebas)
        </label>
      </div>
    </div>
  );
}

function MatrixConfig({
  question,
  onEdit,
}: {
  question: Question;
  onEdit: (q: Question) => void;
}) {
  const rules = question.validationRules ?? {};
  const rows: string[] = rules.matrixRows ?? [''];
  const cols: string[] = rules.matrixColumns ?? [''];

  const updateRows = (next: string[]) =>
    onEdit({ ...question, validationRules: { ...rules, matrixRows: next } });
  const updateCols = (next: string[]) =>
    onEdit({ ...question, validationRules: { ...rules, matrixColumns: next } });

  return (
    <div className="grid grid-cols-2 gap-4">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Baris</label>
        {rows.map((row, i) => (
          <div key={i} className="flex gap-1 mb-1">
            <input
              value={row}
              onChange={(e) => { const n = [...rows]; n[i] = e.target.value; updateRows(n); }}
              className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs"
              placeholder={`Baris ${i + 1}`}
            />
            <button onClick={() => updateRows(rows.filter((_, j) => j !== i))} className="text-red-400 text-xs">✕</button>
          </div>
        ))}
        <button onClick={() => updateRows([...rows, ''])} className="text-primary-600 text-xs">+ Baris</button>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Kolom</label>
        {cols.map((col, i) => (
          <div key={i} className="flex gap-1 mb-1">
            <input
              value={col}
              onChange={(e) => { const n = [...cols]; n[i] = e.target.value; updateCols(n); }}
              className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs"
              placeholder={`Kolom ${i + 1}`}
            />
            <button onClick={() => updateCols(cols.filter((_, j) => j !== i))} className="text-red-400 text-xs">✕</button>
          </div>
        ))}
        <button onClick={() => updateCols([...cols, ''])} className="text-primary-600 text-xs">+ Kolom</button>
      </div>
    </div>
  );
}

function RatingConfig({
  question,
  onEdit,
}: {
  question: Question;
  onEdit: (q: Question) => void;
}) {
  const rules = question.validationRules ?? {};
  const set = (patch: Partial<ValidationRules>) =>
    onEdit({ ...question, validationRules: { ...rules, ...patch } });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Nilai Maks</label>
          <select
            value={rules.ratingMax ?? 5}
            onChange={(e) => set({ ratingMax: Number(e.target.value) })}
            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
          >
            {[3, 4, 5, 7, 10].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Tampilan</label>
          <select
            value={rules.ratingDisplayMode ?? 'star'}
            onChange={(e) => set({ ratingDisplayMode: e.target.value as 'star' | 'number' })}
            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
          >
            <option value="star">⭐ Bintang</option>
            <option value="number">🔢 Angka</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Label kiri (nilai rendah)</label>
          <input
            type="text"
            value={rules.ratingMinLabel ?? ''}
            onChange={(e) => set({ ratingMinLabel: e.target.value })}
            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
            placeholder="Sangat Tidak Puas"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Label kanan (nilai tinggi)</label>
          <input
            type="text"
            value={rules.ratingMaxLabel ?? ''}
            onChange={(e) => set({ ratingMaxLabel: e.target.value })}
            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
            placeholder="Sangat Puas"
          />
        </div>
      </div>
    </div>
  );
}

function RegionConfig({
  question,
  onEdit,
}: {
  question: Question;
  onEdit: (q: Question) => void;
}) {
  const rules = question.validationRules ?? {};
  const set = (patch: Partial<ValidationRules>) =>
    onEdit({ ...question, validationRules: { ...rules, ...patch } });

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Kedalaman wilayah</label>
        <select
          value={rules.regionDepth ?? 'village'}
          onChange={(e) => set({ regionDepth: e.target.value as ValidationRules['regionDepth'] })}
          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
        >
          <option value="province">Provinsi</option>
          <option value="regency">Kabupaten/Kota</option>
          <option value="district">Kecamatan</option>
          <option value="village">Kelurahan/Desa</option>
        </select>
        <p className="text-xs text-gray-400 mt-1">Responden wajib memilih hingga level ini.</p>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Kunci Provinsi (opsional)
        </label>
        <div className="grid grid-cols-2 gap-2">
          <input
            type="text"
            value={rules.lockedProvince?.id ?? ''}
            onChange={(e) =>
              set({ lockedProvince: e.target.value ? { id: e.target.value, name: rules.lockedProvince?.name ?? '' } : null })
            }
            className="px-2 py-1.5 border border-gray-300 rounded text-sm"
            placeholder="ID provinsi"
          />
          <input
            type="text"
            value={rules.lockedProvince?.name ?? ''}
            onChange={(e) =>
              set({ lockedProvince: e.target.value ? { id: rules.lockedProvince?.id ?? '', name: e.target.value } : null })
            }
            className="px-2 py-1.5 border border-gray-300 rounded text-sm"
            placeholder="Nama provinsi"
          />
        </div>
        <p className="text-xs text-gray-400 mt-1">
          Isi ID & nama untuk mengunci provinsi. Contoh: ID=32, Nama=JAWA BARAT
        </p>
      </div>
      {rules.lockedProvince && (
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Kunci Kabupaten/Kota (opsional)
          </label>
          <div className="grid grid-cols-2 gap-2">
            <input
              type="text"
              value={rules.lockedRegency?.id ?? ''}
              onChange={(e) =>
                set({ lockedRegency: e.target.value ? { id: e.target.value, name: rules.lockedRegency?.name ?? '' } : null })
              }
              className="px-2 py-1.5 border border-gray-300 rounded text-sm"
              placeholder="ID kab/kota"
            />
            <input
              type="text"
              value={rules.lockedRegency?.name ?? ''}
              onChange={(e) =>
                set({ lockedRegency: e.target.value ? { id: rules.lockedRegency?.id ?? '', name: e.target.value } : null })
              }
              className="px-2 py-1.5 border border-gray-300 rounded text-sm"
              placeholder="Nama kab/kota"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function NumericConfig({
  question,
  onEdit,
}: {
  question: Question;
  onEdit: (q: Question) => void;
}) {
  const rules = question.validationRules ?? {};
  const set = (patch: Partial<ValidationRules>) =>
    onEdit({ ...question, validationRules: { ...rules, ...patch } });
  const range = rules.numericRange ?? {};

  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Nilai Min</label>
        <input
          type="number"
          value={range.min ?? ''}
          onChange={(e) => set({ numericRange: { ...range, min: Number(e.target.value) } })}
          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
          placeholder="0"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Nilai Maks</label>
        <input
          type="number"
          value={range.max ?? ''}
          onChange={(e) => set({ numericRange: { ...range, max: Number(e.target.value) } })}
          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
          placeholder="100"
        />
      </div>
    </div>
  );
}

function UniqueIdConfig({
  question,
  onEdit,
}: {
  question: Question;
  onEdit: (q: Question) => void;
}) {
  const rules = question.validationRules ?? {};
  const set = (patch: Partial<ValidationRules>) =>
    onEdit({ ...question, validationRules: { ...rules, ...patch } });

  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Min Digit</label>
        <input
          type="number"
          value={rules.minLength ?? ''}
          onChange={(e) => set({ minLength: e.target.value ? Number(e.target.value) : undefined })}
          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
          placeholder="5"
          min={1}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Maks Digit</label>
        <input
          type="number"
          value={rules.maxLength ?? ''}
          onChange={(e) => set({ maxLength: e.target.value ? Number(e.target.value) : undefined })}
          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
          placeholder="10"
          min={1}
        />
      </div>
      <div className="col-span-2 text-xs text-gray-400">
        Hanya angka. Unik per survei (duplikat ditolak sisi server).
      </div>
    </div>
  );
}

// ─── Skip Logic / Visibility Editor ──────────────────────────────────────────

function LogicEditor({
  question,
  allQuestions,
  onEdit,
}: {
  question: Question;
  allQuestions: Question[];
  onEdit: (q: Question) => void;
}) {
  const others = allQuestions.filter((q) => q.id !== question.id);
  const skipRules = question.skipLogicRules ?? [];
  const visRules = question.visibilityRules ?? [];

  const setSkip = (rules: SkipLogicRule[]) => onEdit({ ...question, skipLogicRules: rules });
  const setVis = (rules: VisibilityRule[]) => onEdit({ ...question, visibilityRules: rules });

  const blankSkip = (): SkipLogicRule => ({
    sourceQuestionId: '',
    operator: 'equals',
    conditionValue: '',
    action: 'skip',
  });

  const blankVis = (): VisibilityRule => ({
    sourceQuestionId: '',
    operator: 'equals',
    conditionValue: '',
    visibilityAction: 'show',
  });

  return (
    <div className="space-y-4">
      {/* Skip Logic */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold text-purple-700 uppercase tracking-wide">
            Skip Logic
          </h4>
          <button
            onClick={() => setSkip([...skipRules, blankSkip()])}
            className="text-xs text-purple-600 hover:text-purple-800"
          >
            + Tambah Aturan
          </button>
        </div>
        <p className="text-xs text-gray-400 mb-2">
          Sembunyikan pertanyaan ini jika kondisi terpenuhi.
        </p>
        {skipRules.length === 0 && (
          <p className="text-xs text-gray-400 italic">Tidak ada skip logic.</p>
        )}
        {skipRules.map((rule, idx) => (
          <div key={idx} className="bg-purple-50 border border-purple-100 rounded p-2 mb-2 space-y-2">
            <div className="grid grid-cols-3 gap-1.5">
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">Jika pertanyaan</label>
                <select
                  value={rule.sourceQuestionId}
                  onChange={(e) => { const n = [...skipRules]; n[idx] = { ...rule, sourceQuestionId: e.target.value }; setSkip(n); }}
                  className="w-full px-1.5 py-1 border border-purple-200 rounded text-xs"
                >
                  <option value="">— pilih —</option>
                  {others.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.text ? (q.text.length > 30 ? q.text.slice(0, 30) + '…' : q.text) : `Q${q.order + 1}`}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">Operator</label>
                <select
                  value={rule.operator}
                  onChange={(e) => { const n = [...skipRules]; n[idx] = { ...rule, operator: e.target.value as ConditionOperator }; setSkip(n); }}
                  className="w-full px-1.5 py-1 border border-purple-200 rounded text-xs"
                >
                  {(Object.entries(operatorLabels) as [ConditionOperator, string][]).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">Nilai</label>
                <input
                  type="text"
                  value={rule.conditionValue}
                  onChange={(e) => { const n = [...skipRules]; n[idx] = { ...rule, conditionValue: e.target.value }; setSkip(n); }}
                  className="w-full px-1.5 py-1 border border-purple-200 rounded text-xs"
                  placeholder="nilai..."
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Aksi:</span>
                <select
                  value={rule.action}
                  onChange={(e) => { const n = [...skipRules]; n[idx] = { ...rule, action: e.target.value as 'skip' | 'jump_to' }; setSkip(n); }}
                  className="px-1.5 py-1 border border-purple-200 rounded text-xs"
                >
                  <option value="skip">Sembunyikan pertanyaan ini</option>
                  <option value="jump_to">Lompat ke pertanyaan lain</option>
                </select>
                {rule.action === 'jump_to' && (
                  <select
                    value={rule.targetQuestionId ?? ''}
                    onChange={(e) => { const n = [...skipRules]; n[idx] = { ...rule, targetQuestionId: e.target.value }; setSkip(n); }}
                    className="px-1.5 py-1 border border-purple-200 rounded text-xs"
                  >
                    <option value="">— tujuan —</option>
                    {others.map((q) => (
                      <option key={q.id} value={q.id}>
                        {q.text ? q.text.slice(0, 25) : `Q${q.order + 1}`}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <button
                onClick={() => setSkip(skipRules.filter((_, i) => i !== idx))}
                className="text-red-400 hover:text-red-600 text-xs"
              >
                Hapus
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Visibility Rules */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold text-blue-700 uppercase tracking-wide">
            Visibilitas
          </h4>
          <button
            onClick={() => setVis([...visRules, blankVis()])}
            className="text-xs text-blue-600 hover:text-blue-800"
          >
            + Tambah Kondisi
          </button>
        </div>
        <p className="text-xs text-gray-400 mb-2">
          Tampilkan/sembunyikan pertanyaan ini berdasarkan jawaban pertanyaan lain.
        </p>
        {visRules.length === 0 && (
          <p className="text-xs text-gray-400 italic">Selalu tampil.</p>
        )}
        {visRules.map((rule, idx) => (
          <div key={idx} className="bg-blue-50 border border-blue-100 rounded p-2 mb-2 space-y-2">
            <div className="grid grid-cols-3 gap-1.5">
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">Jika pertanyaan</label>
                <select
                  value={rule.sourceQuestionId}
                  onChange={(e) => { const n = [...visRules]; n[idx] = { ...rule, sourceQuestionId: e.target.value }; setVis(n); }}
                  className="w-full px-1.5 py-1 border border-blue-200 rounded text-xs"
                >
                  <option value="">— pilih —</option>
                  {others.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.text ? (q.text.length > 30 ? q.text.slice(0, 30) + '…' : q.text) : `Q${q.order + 1}`}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">Operator</label>
                <select
                  value={rule.operator}
                  onChange={(e) => { const n = [...visRules]; n[idx] = { ...rule, operator: e.target.value as ConditionOperator }; setVis(n); }}
                  className="w-full px-1.5 py-1 border border-blue-200 rounded text-xs"
                >
                  {(Object.entries(operatorLabels) as [ConditionOperator, string][]).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">Nilai</label>
                <input
                  type="text"
                  value={rule.conditionValue}
                  onChange={(e) => { const n = [...visRules]; n[idx] = { ...rule, conditionValue: e.target.value }; setVis(n); }}
                  className="w-full px-1.5 py-1 border border-blue-200 rounded text-xs"
                  placeholder="nilai..."
                />
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Maka:</span>
                <select
                  value={rule.visibilityAction}
                  onChange={(e) => { const n = [...visRules]; n[idx] = { ...rule, visibilityAction: e.target.value as 'show' | 'hide' }; setVis(n); }}
                  className="px-1.5 py-1 border border-blue-200 rounded text-xs"
                >
                  <option value="show">Tampilkan pertanyaan ini</option>
                  <option value="hide">Sembunyikan pertanyaan ini</option>
                </select>
              </div>
              <button
                onClick={() => setVis(visRules.filter((_, i) => i !== idx))}
                className="text-red-400 hover:text-red-600 text-xs"
              >
                Hapus
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Sortable Question Card ───────────────────────────────────────────────────

function SortableQuestionCard({
  question,
  index,
  onEdit,
  onDelete,
  onDuplicate,
  allQuestions,
}: {
  question: Question;
  index: number;
  onEdit: (q: Question) => void;
  onDelete: (id: string) => void;
  onDuplicate: (q: Question) => void;
  allQuestions: Question[];
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: question.id,
  });

  const style = { transform: CSS.Transform.toString(transform), transition };
  // Pertanyaan baru (teks masih kosong) otomatis terbuka agar langsung bisa diisi.
  const [expanded, setExpanded] = useState(question.text.trim() === '');
  const [tab, setTab] = useState<'edit' | 'logic' | 'validation'>('edit');

  const hasLogic =
    (question.skipLogicRules?.length ?? 0) > 0 ||
    (question.visibilityRules?.length ?? 0) > 0;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`bg-white border rounded-lg mb-3 transition-shadow ${expanded ? 'border-primary-300 shadow-md' : 'border-gray-200'}`}
    >
      {/* Header */}
      <div className="flex items-center gap-3 p-4">
        <button
          {...attributes}
          {...listeners}
          className="cursor-grab text-gray-300 hover:text-gray-500 text-lg leading-none"
          title="Geser untuk mengurutkan"
        >
          ⠿
        </button>
        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gray-100 text-xs font-semibold text-gray-600">
          {index + 1}
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">
            {question.text || <span className="text-gray-400 italic">Pertanyaan baru</span>}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-gray-400">{questionTypeLabels[question.type]}</span>
            {question.required && (
              <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">Wajib</span>
            )}
            {hasLogic && (
              <span className="text-xs bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-full">Logic</span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => { setExpanded(!expanded); if (!expanded) setTab('edit'); }}
            className={`px-3 py-1.5 text-xs rounded-md transition-colors ${expanded ? 'bg-primary-100 text-primary-700' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
          >
            {expanded ? 'Tutup' : 'Edit'}
          </button>
          <button
            onClick={() => onDuplicate(question)}
            className="px-2 py-1.5 text-xs bg-gray-100 text-gray-600 rounded-md hover:bg-gray-200"
            title="Duplikat"
          >
            ⧉
          </button>
          <button
            onClick={() => onDelete(question.id)}
            className="px-2 py-1.5 text-xs bg-red-50 text-red-500 rounded-md hover:bg-red-100"
            title="Hapus"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Expanded panel */}
      {expanded && (
        <div className="border-t border-gray-100">
          {/* Tabs */}
          <div className="flex border-b border-gray-100 px-4">
            {(['edit', 'logic', 'validation'] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={`px-4 py-2.5 text-xs font-medium border-b-2 transition-colors ${
                  tab === t
                    ? 'border-primary-500 text-primary-700'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                {t === 'edit' ? '✏️ Edit' : t === 'logic' ? '🔀 Logic' : '✅ Validasi'}
              </button>
            ))}
          </div>

          <div className="p-4 space-y-4">
            {tab === 'edit' && (
              <>
                {/* Teks pertanyaan */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Teks Pertanyaan</label>
                  <input
                    type="text"
                    value={question.text}
                    onChange={(e) => onEdit({ ...question, text: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                    placeholder="Tulis pertanyaan di sini..."
                  />
                </div>

                {/* Deskripsi */}
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Deskripsi (opsional)</label>
                  <input
                    type="text"
                    value={question.validationRules?.description ?? ''}
                    onChange={(e) =>
                      onEdit({ ...question, validationRules: { ...question.validationRules, description: e.target.value } })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
                    placeholder="Penjelasan tambahan untuk responden..."
                  />
                </div>

                {/* Status pertanyaan: Wajib / Opsional / Nonaktif */}
                <div>
                  <label className="mb-1 block text-xs font-medium text-gray-600">Status pertanyaan</label>
                  <div className="inline-flex rounded-md border border-gray-300 p-0.5">
                    {([
                      { key: 'required', label: 'Wajib' },
                      { key: 'optional', label: 'Opsional' },
                      { key: 'disabled', label: 'Nonaktif' },
                    ] as const).map((opt) => {
                      const mode =
                        question.enabled === false
                          ? 'disabled'
                          : question.required
                            ? 'required'
                            : 'optional';
                      const active = mode === opt.key;
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          onClick={() => {
                            if (opt.key === 'required') onEdit({ ...question, required: true, enabled: true });
                            else if (opt.key === 'optional') onEdit({ ...question, required: false, enabled: true });
                            else onEdit({ ...question, enabled: false });
                          }}
                          className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                            active ? 'bg-primary-600 text-white' : 'text-gray-600 hover:bg-gray-100'
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>
                  {question.enabled === false && (
                    <p className="mt-1 text-xs text-amber-600">
                      Pertanyaan ini tidak ditampilkan ke responden.
                    </p>
                  )}
                </div>

                {/* Konfigurasi per tipe */}
                {(question.type === 'single_choice' || question.type === 'multiple_choice' || question.type === 'dropdown') && (
                  <ChoiceConfig question={question} onEdit={onEdit} />
                )}
                {question.type === 'matrix_likert' && (
                  <MatrixConfig question={question} onEdit={onEdit} />
                )}
                {question.type === 'rating_scale' && (
                  <RatingConfig question={question} onEdit={onEdit} />
                )}
                {question.type === 'indonesia_region' && (
                  <RegionConfig question={question} onEdit={onEdit} />
                )}
                {question.type === 'numeric_scale' && (
                  <NumericConfig question={question} onEdit={onEdit} />
                )}
                {question.type === 'unique_id' && (
                  <UniqueIdConfig question={question} onEdit={onEdit} />
                )}
              </>
            )}

            {tab === 'logic' && (
              <LogicEditor question={question} allQuestions={allQuestions} onEdit={onEdit} />
            )}

            {tab === 'validation' && (
              <div className="space-y-3">
                {(question.type === 'short_text' || question.type === 'long_text') && (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Min Karakter</label>
                        <input
                          type="number"
                          value={question.validationRules?.minLength ?? ''}
                          onChange={(e) =>
                            onEdit({ ...question, validationRules: { ...question.validationRules, minLength: e.target.value ? Number(e.target.value) : undefined } })
                          }
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                          min={0}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Maks Karakter</label>
                        <input
                          type="number"
                          value={question.validationRules?.maxLength ?? ''}
                          onChange={(e) =>
                            onEdit({ ...question, validationRules: { ...question.validationRules, maxLength: e.target.value ? Number(e.target.value) : undefined } })
                          }
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                          min={1}
                        />
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-4">
                      <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={question.validationRules?.emailFormat ?? false}
                          onChange={(e) => onEdit({ ...question, validationRules: { ...question.validationRules, emailFormat: e.target.checked } })}
                          className="rounded"
                        />
                        Validasi format email
                      </label>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Pola Regex (opsional)</label>
                      <input
                        type="text"
                        value={question.validationRules?.regex ?? ''}
                        onChange={(e) => onEdit({ ...question, validationRules: { ...question.validationRules, regex: e.target.value } })}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm font-mono"
                        placeholder="^\d{5}$"
                      />
                    </div>
                  </>
                )}
                {question.type === 'multiple_choice' && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Min Pilihan</label>
                      <input
                        type="number"
                        value={question.validationRules?.minCheckbox ?? ''}
                        onChange={(e) => onEdit({ ...question, validationRules: { ...question.validationRules, minCheckbox: e.target.value ? Number(e.target.value) : undefined } })}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                        min={1}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">Maks Pilihan</label>
                      <input
                        type="number"
                        value={question.validationRules?.maxCheckbox ?? ''}
                        onChange={(e) => onEdit({ ...question, validationRules: { ...question.validationRules, maxCheckbox: e.target.value ? Number(e.target.value) : undefined } })}
                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                        min={1}
                      />
                    </div>
                  </div>
                )}
                {!['short_text', 'long_text', 'multiple_choice'].includes(question.type) && (
                  <p className="text-xs text-gray-400 italic">Tidak ada opsi validasi tambahan untuk tipe ini.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export function SurveyEditPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [survey, setSurvey] = useState<SurveyDetail | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [newQuestionType, setNewQuestionType] = useState<QuestionType>('single_choice');
  const [saveMessage, setSaveMessage] = useState<{ ok: boolean; text: string } | null>(null);
  // Pengaturan survei (tipe, kategori, mode form)
  const [settingsType, setSettingsType] = useState<'nasional' | 'daerah' | 'lainnya'>('lainnya');
  const [settingsCategory, setSettingsCategory] = useState('');
  const [settingsFormMode, setSettingsFormMode] = useState<'paginated' | 'scroll' | 'wizard'>('paginated');
  const [savingSettings, setSavingSettings] = useState(false);

  const saveSettings = async () => {
    setSavingSettings(true);
    setSaveMessage(null);
    try {
      await api.put(`/surveys/${id}`, {
        surveyType: settingsType,
        category: settingsCategory || undefined,
        formMode: settingsFormMode,
      });
      setSaveMessage({ ok: true, text: 'Pengaturan survei disimpan ✓' });
    } catch {
      setSaveMessage({ ok: false, text: 'Gagal menyimpan pengaturan ✗' });
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
          questions: mapped,
        });
        setSettingsType(survey.surveyType ?? 'lainnya');
        setSettingsCategory(survey.category ?? '');
        setSettingsFormMode(survey.formMode ?? 'paginated');
        setQuestions(mapped);
      } catch {
        alert('Gagal memuat survei');
        navigate('/admin/surveys');
      } finally {
        setLoading(false);
      }
    };
    fetchSurvey();
  }, [id, navigate]);

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
    const defaults: Partial<Question> = {};
    if (type === 'single_choice' || type === 'multiple_choice' || type === 'dropdown') {
      defaults.options = [
        { id: `opt-${Date.now()}-1`, label: 'Opsi 1', value: 'option_1', order: 0 },
        { id: `opt-${Date.now()}-2`, label: 'Opsi 2', value: 'option_2', order: 1 },
      ];
    }
    if (type === 'matrix_likert') {
      defaults.validationRules = { matrixRows: ['Aspek 1'], matrixColumns: ['Sangat Setuju', 'Setuju', 'Tidak Setuju'] };
    }
    if (type === 'rating_scale') {
      defaults.validationRules = { ratingMax: 5, ratingDisplayMode: 'star' };
    }
    if (type === 'numeric_scale') {
      defaults.validationRules = { numericRange: { min: 1, max: 10 } };
    }
    if (type === 'indonesia_region') {
      defaults.validationRules = { regionDepth: 'village' };
    }
    if (type === 'unique_id') {
      defaults.validationRules = { minLength: 5, maxLength: 10 };
    }

    const newQ: Question = {
      id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      type,
      text: '',
      required: false,
      enabled: true,
      order: questions.length,
      ...defaults,
    };
    setQuestions((prev) => [...prev, newQ]);
  };

  const editQuestion = useCallback((updated: Question) => {
    setQuestions((prev) => prev.map((q) => (q.id === updated.id ? updated : q)));
  }, []);

  const deleteQuestion = useCallback((qId: string) => {
    setQuestions((prev) =>
      prev.filter((q) => q.id !== qId).map((q, idx) => ({ ...q, order: idx })),
    );
  }, []);

  const duplicateQuestion = useCallback((q: Question) => {
    const copy: Question = {
      ...q,
      id: `q-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      order: questions.length,
      skipLogicRules: [],
      visibilityRules: [],
    };
    setQuestions((prev) => [...prev, copy]);
  }, [questions.length]);

  const handleSave = async () => {
    setSaving(true);
    setSaveMessage(null);
    try {
      const payload = questions.map((q, idx) => ({
        type: q.type,
        text: q.text ?? '',
        required: !!q.required,
        enabled: q.enabled !== false,
        order: idx,
        hasOtherOption: !!q.hasOtherOption,
        options: (q.options ?? []).map((o, i) => ({
          label: o.label,
          value: o.value || o.label,
          orderIndex: i,
        })),
        validationRules: q.validationRules ?? null,
      }));
      await api.put(`/surveys/${id}/questions`, { questions: payload });
      setSaveMessage({ ok: true, text: 'Survei berhasil disimpan' });
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err: unknown) {
      const e = err as { message?: string | string[] };
      const msg = Array.isArray(e.message) ? e.message.join(', ') : e.message;
      setSaveMessage({ ok: false, text: msg || 'Gagal menyimpan survei' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-6 text-center text-gray-500">Memuat survei...</div>;
  }

  // Kelompokkan tipe pertanyaan dalam kategori untuk selector
  const typeGroups: { label: string; types: QuestionType[] }[] = [
    { label: 'Pilihan', types: ['single_choice', 'multiple_choice', 'dropdown'] },
    { label: 'Teks', types: ['short_text', 'long_text'] },
    { label: 'Angka & Skala', types: ['numeric_scale', 'rating_scale'] },
    { label: 'Waktu', types: ['date', 'date_time'] },
    { label: 'Kontak & ID', types: ['phone_number', 'unique_id'] },
    { label: 'Lanjutan', types: ['matrix_likert', 'indonesia_region', 'file_upload', 'signature', 'photo', 'gps', 'audio'] },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate('/admin/surveys')} className="text-gray-600 hover:text-gray-900 text-sm">
            ← Kembali
          </button>
          <h1 className="text-2xl font-bold text-gray-900">Edit: {survey?.title}</h1>
        </div>
        <div className="flex items-center gap-3">
          {saveMessage && (
            <span className={`text-sm ${saveMessage.ok ? 'text-emerald-600' : 'text-red-600'}`}>
              {saveMessage.ok ? '✓' : '✗'} {saveMessage.text}
            </span>
          )}
          <button
            onClick={() => navigate(`/admin/surveys/${id}/preview`)}
            className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm transition-colors"
          >
            Preview
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-primary-600 text-white rounded-md hover:bg-primary-700 disabled:opacity-50 text-sm transition-colors"
          >
            {saving ? 'Menyimpan...' : 'Simpan'}
          </button>
        </div>
      </div>

      {/* Pengaturan Survei */}
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Pengaturan Survei</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Tipe Survei</label>
            <select
              value={settingsType}
              onChange={(e) => setSettingsType(e.target.value as typeof settingsType)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
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
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
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
            <label className="mb-1 block text-xs font-medium text-gray-600">Mode Tampilan Form</label>
            <select
              value={settingsFormMode}
              onChange={(e) => setSettingsFormMode(e.target.value as typeof settingsFormMode)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="paginated">Paginasi</option>
              <option value="scroll">Scroll</option>
              <option value="wizard">Wizard (1 pertanyaan/langkah)</option>
            </select>
          </div>
        </div>
        <div className="mt-3">
          <button
            onClick={saveSettings}
            disabled={savingSettings}
            className="rounded-md border border-gray-300 px-4 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {savingSettings ? 'Menyimpan...' : 'Simpan Pengaturan'}
          </button>
        </div>
      </div>

      {/* Builder */}
      <div className="bg-gray-50 rounded-lg p-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-4">
          Pertanyaan ({questions.length})
        </h2>

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={questions.map((q) => q.id)} strategy={verticalListSortingStrategy}>
            {questions.map((question, idx) => (
              <SortableQuestionCard
                key={question.id}
                question={question}
                index={idx}
                onEdit={editQuestion}
                onDelete={deleteQuestion}
                onDuplicate={duplicateQuestion}
                allQuestions={questions}
              />
            ))}
          </SortableContext>
        </DndContext>

        {questions.length === 0 && (
          <div className="rounded-md border border-dashed border-gray-200 py-10 text-center text-sm text-gray-400">
            Belum ada pertanyaan. Pilih tipe di bawah lalu klik &ldquo;Tambah pertanyaan&rdquo;.
          </div>
        )}
      </div>

      {/* Tambah pertanyaan — di LUAR kotak, mudah dijangkau */}
      <div className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white p-4 shadow-sm sm:flex-row sm:items-end">
        <div className="flex-1">
          <label htmlFor="new-question-type" className="mb-1 block text-xs font-medium text-gray-500">
            Tipe pertanyaan
          </label>
          <select
            id="new-question-type"
            value={newQuestionType}
            onChange={(e) => setNewQuestionType(e.target.value as QuestionType)}
            className="w-full rounded-md border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-800 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20"
          >
            {typeGroups.map((group) => (
              <optgroup key={group.label} label={group.label}>
                {group.types.map((type) => (
                  <option key={type} value={type}>
                    {questionTypeLabels[type]}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <button
          onClick={() => addQuestion(newQuestionType)}
          className="shrink-0 rounded-md bg-primary-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-700"
        >
          + Tambah pertanyaan
        </button>
      </div>
    </div>
  );
}
