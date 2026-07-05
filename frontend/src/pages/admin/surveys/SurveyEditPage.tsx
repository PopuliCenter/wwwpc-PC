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
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
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
  | 'random_arm'
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
  /** Acak urutan opsi saat ditampilkan ke responden ("Lainnya" tetap di bawah). */
  randomizeOptions?: boolean;
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
  captureGps: boolean;
  requireSignature: boolean;
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
  skipLogicRules?: SkipLogicRule[];
  visibilityRules?: VisibilityRule[];
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
    // Muat aturan skip/visibilitas agar logika tidak hilang saat survei diedit.
    skipLogicRules: (q.skipLogicRules ?? []).map((r) => ({
      sourceQuestionId: r.sourceQuestionId,
      operator: r.operator,
      conditionValue: r.conditionValue,
      action: r.action,
      targetQuestionId: r.targetQuestionId ?? undefined,
    })),
    visibilityRules: (q.visibilityRules ?? []).map((r) => ({
      sourceQuestionId: r.sourceQuestionId,
      operator: r.operator,
      conditionValue: r.conditionValue,
      visibilityAction: r.visibilityAction,
    })),
  };
}

/** Ubah pertanyaan hasil impor Excel → bentuk Question editor (order lanjut dari baseOrder). */
function buildQuestionsFromImport(imported: ImportedQuestion[], baseOrder: number): Question[] {
  return imported.map((iq, i) => ({
    id: `q-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
    type: iq.type as QuestionType,
    text: iq.text,
    required: iq.required,
    enabled: true,
    order: baseOrder + i,
    hasOtherOption: iq.hasOtherOption,
    options: iq.options.map((o, oi) => ({
      id: `opt-${Date.now()}-${i}-${oi}`,
      label: o.label,
      value: o.value,
      order: oi,
    })),
    validationRules: iq.description ? { description: iq.description } : undefined,
  }));
}

/**
 * Ikon (?) kecil dengan penjelasan singkat (muncul saat kursor diarahkan) —
 * membantu pengguna awam memahami istilah tanpa membuat tampilan penuh teks.
 */
function InfoHint({ text }: { text: string }) {
  return (
    <span
      title={text}
      aria-label={text}
      className="ml-1 inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full bg-gray-200 text-[10px] font-bold text-gray-600 align-middle"
    >
      ?
    </span>
  );
}

// ─── Metadata tipe pertanyaan ─────────────────────────────────────────────────
const questionTypeLabels: Record<QuestionType, string> = {
  single_choice: 'Pilihan Tunggal',
  multiple_choice: 'Pilihan Ganda',
  short_text: 'Teks Pendek',
  long_text: 'Teks Panjang',
  phone_number: 'No. Telepon',
  numeric_scale: 'Skala Angka',
  dropdown: 'Pilih dari Daftar',
  matrix_likert: 'Tabel Penilaian',
  file_upload: 'Unggah Berkas',
  date_time: 'Tanggal & Waktu',
  date: 'Tanggal',
  rating_scale: 'Bintang/Rating',
  unique_id: 'Nomor Unik',
  indonesia_region: 'Wilayah (Prov/Kab/Kec)',
  signature: 'Tanda Tangan',
  photo: 'Foto (Kamera)',
  gps: 'Titik GPS',
  audio: 'Rekaman Audio',
  random_arm: 'Penugasan Acak (Eksperimen)',
};

// Grup tipe untuk dropdown tambah/ubah pertanyaan. (gps & signature SENGAJA
// tak ada — kini setelan survei, bukan tipe pertanyaan.)
const typeGroups: { label: string; types: QuestionType[] }[] = [
  { label: 'Pilihan', types: ['single_choice', 'multiple_choice', 'dropdown'] },
  { label: 'Teks', types: ['short_text', 'long_text'] },
  { label: 'Angka & Skala', types: ['numeric_scale', 'rating_scale'] },
  { label: 'Waktu', types: ['date', 'date_time'] },
  { label: 'Kontak & ID', types: ['phone_number', 'unique_id'] },
  { label: 'Lanjutan', types: ['matrix_likert', 'indonesia_region'] },
  { label: 'Media', types: ['photo', 'audio', 'file_upload'] },
  { label: 'Eksperimen', types: ['random_arm'] },
];

/** Default konfigurasi per tipe (opsi/aturan validasi). */
function defaultsForType(type: QuestionType): Partial<Question> {
  if (type === 'single_choice' || type === 'multiple_choice' || type === 'dropdown') {
    return {
      options: [
        { id: `opt-${Date.now()}-1`, label: 'Opsi 1', value: 'option_1', order: 0 },
        { id: `opt-${Date.now()}-2`, label: 'Opsi 2', value: 'option_2', order: 1 },
      ],
    };
  }
  if (type === 'matrix_likert')
    return {
      validationRules: {
        matrixRows: ['Aspek 1'],
        matrixColumns: ['Sangat Setuju', 'Setuju', 'Tidak Setuju'],
      },
    };
  if (type === 'rating_scale')
    return { validationRules: { ratingMax: 5, ratingDisplayMode: 'star' } };
  if (type === 'numeric_scale') return { validationRules: { numericRange: { min: 1, max: 10 } } };
  if (type === 'indonesia_region') return { validationRules: { regionDepth: 'village' } };
  if (type === 'unique_id') return { validationRules: { minLength: 5, maxLength: 10 } };
  if (type === 'random_arm') {
    // Default 2 kelompok dengan KODE ANGKA (1, 2) — ramah SPSS.
    return {
      options: [
        { id: `arm-${Date.now()}-1`, label: 'Kelompok 1', value: '1', order: 0 },
        { id: `arm-${Date.now()}-2`, label: 'Kelompok 2', value: '2', order: 1 },
      ],
    };
  }
  return {};
}

const operatorLabels: Record<ConditionOperator, string> = {
  equals: 'sama dengan (=)',
  not_equals: 'tidak sama dengan (≠)',
  contains: 'mengandung kata',
  greater_than: 'lebih besar dari (>)',
  less_than: 'lebih kecil dari (<)',
};

// ─── Komponen konfigurasi per tipe ───────────────────────────────────────────

function ChoiceConfig({ question, onEdit }: { question: Question; onEdit: (q: Question) => void }) {
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
              next[idx] = {
                ...opt,
                label: e.target.value,
                value: e.target.value.toLowerCase().replace(/\s+/g, '_'),
              };
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
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id={`randomize-${question.id}`}
          checked={question.validationRules?.randomizeOptions ?? false}
          onChange={(e) =>
            onEdit({
              ...question,
              validationRules: { ...question.validationRules, randomizeOptions: e.target.checked },
            })
          }
          className="rounded border-gray-300"
        />
        <label htmlFor={`randomize-${question.id}`} className="text-xs text-gray-600">
          Acak urutan opsi (opsi "Lainnya" tetap di bawah)
        </label>
      </div>
    </div>
  );
}

/**
 * Editor "Penugasan Acak (Eksperimen)". Tiap baris = satu KELOMPOK (arm) dengan
 * KODE angka (untuk SPSS) + nama. Sistem mengundi satu kelompok per responden
 * dengan peluang sama rata; pertanyaan ini tidak ditampilkan ke responden dan
 * dipakai sebagai sumber di tab "Aturan Tampil" (mis. tampil jika Kode = 2).
 */
function ArmConfig({ question, onEdit }: { question: Question; onEdit: (q: Question) => void }) {
  const arms = question.options ?? [];

  return (
    <div className="space-y-2">
      <div className="rounded-md bg-indigo-50 border border-indigo-100 p-3 text-xs text-indigo-900">
        <p className="font-medium">Cara kerja</p>
        <p className="mt-1">
          Pertanyaan ini <strong>tidak ditampilkan</strong> ke responden. Sistem mengundi satu
          kelompok di bawah (peluang sama rata) untuk tiap responden. Lalu di tab{' '}
          <strong>“Aturan Tampil”</strong> pada pertanyaan cabang, pilih sumber pertanyaan ini dan
          kode kelompoknya — mis. <em>“tampilkan jika [pertanyaan ini] = 2”</em>. Gunakan{' '}
          <strong>kode angka</strong>
          (1, 2, 3) agar mudah diolah di SPSS.
        </p>
      </div>
      <label className="block text-xs font-medium text-gray-600">Kelompok (arm)</label>
      {arms.map((arm, idx) => (
        <div key={arm.id} className="flex items-center gap-2">
          <input
            type="text"
            value={arm.value}
            onChange={(e) => {
              const next = [...arms];
              next[idx] = { ...arm, value: e.target.value.trim() };
              onEdit({ ...question, options: next });
            }}
            className="w-16 px-2 py-1.5 border border-gray-300 rounded text-sm text-center focus:outline-none focus:ring-1 focus:ring-primary-500"
            placeholder="Kode"
            title="Kode kelompok (angka untuk SPSS)"
          />
          <input
            type="text"
            value={arm.label}
            onChange={(e) => {
              const next = [...arms];
              next[idx] = { ...arm, label: e.target.value };
              onEdit({ ...question, options: next });
            }}
            className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
            placeholder={`Nama kelompok ${idx + 1}`}
          />
          <button
            onClick={() => onEdit({ ...question, options: arms.filter((_, i) => i !== idx) })}
            className="text-red-400 hover:text-red-600 text-sm px-1"
            title="Hapus kelompok"
            disabled={arms.length <= 2}
          >
            ✕
          </button>
        </div>
      ))}
      <button
        onClick={() => {
          // Kode angka berikutnya = (kode angka terbesar saat ini) + 1.
          const maxCode = arms.reduce((m, a) => {
            const n = Number(a.value);
            return Number.isFinite(n) && n > m ? n : m;
          }, 0);
          const nextCode = String(maxCode + 1);
          const newArm: QuestionOption = {
            id: `arm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            label: '',
            value: nextCode,
            order: arms.length,
          };
          onEdit({ ...question, options: [...arms, newArm] });
        }}
        className="text-primary-600 text-sm hover:text-primary-800 mt-1 flex items-center gap-1"
      >
        + Tambah Kelompok
      </button>
      <p className="text-[11px] text-gray-400">Minimal 2 kelompok.</p>
    </div>
  );
}

function MatrixConfig({ question, onEdit }: { question: Question; onEdit: (q: Question) => void }) {
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
              onChange={(e) => {
                const n = [...rows];
                n[i] = e.target.value;
                updateRows(n);
              }}
              className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs"
              placeholder={`Baris ${i + 1}`}
            />
            <button
              onClick={() => updateRows(rows.filter((_, j) => j !== i))}
              className="text-red-400 text-xs"
            >
              ✕
            </button>
          </div>
        ))}
        <button onClick={() => updateRows([...rows, ''])} className="text-primary-600 text-xs">
          + Baris
        </button>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Kolom</label>
        {cols.map((col, i) => (
          <div key={i} className="flex gap-1 mb-1">
            <input
              value={col}
              onChange={(e) => {
                const n = [...cols];
                n[i] = e.target.value;
                updateCols(n);
              }}
              className="flex-1 px-2 py-1 border border-gray-300 rounded text-xs"
              placeholder={`Kolom ${i + 1}`}
            />
            <button
              onClick={() => updateCols(cols.filter((_, j) => j !== i))}
              className="text-red-400 text-xs"
            >
              ✕
            </button>
          </div>
        ))}
        <button onClick={() => updateCols([...cols, ''])} className="text-primary-600 text-xs">
          + Kolom
        </button>
      </div>
    </div>
  );
}

function RatingConfig({ question, onEdit }: { question: Question; onEdit: (q: Question) => void }) {
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
              <option key={n} value={n}>
                {n}
              </option>
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
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Label kiri (nilai rendah)
          </label>
          <input
            type="text"
            value={rules.ratingMinLabel ?? ''}
            onChange={(e) => set({ ratingMinLabel: e.target.value })}
            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
            placeholder="Sangat Tidak Puas"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Label kanan (nilai tinggi)
          </label>
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

function RegionConfig({ question, onEdit }: { question: Question; onEdit: (q: Question) => void }) {
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
              set({
                lockedProvince: e.target.value
                  ? { id: e.target.value, name: rules.lockedProvince?.name ?? '' }
                  : null,
              })
            }
            className="px-2 py-1.5 border border-gray-300 rounded text-sm"
            placeholder="ID provinsi"
          />
          <input
            type="text"
            value={rules.lockedProvince?.name ?? ''}
            onChange={(e) =>
              set({
                lockedProvince: e.target.value
                  ? { id: rules.lockedProvince?.id ?? '', name: e.target.value }
                  : null,
              })
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
                set({
                  lockedRegency: e.target.value
                    ? { id: e.target.value, name: rules.lockedRegency?.name ?? '' }
                    : null,
                })
              }
              className="px-2 py-1.5 border border-gray-300 rounded text-sm"
              placeholder="ID kab/kota"
            />
            <input
              type="text"
              value={rules.lockedRegency?.name ?? ''}
              onChange={(e) =>
                set({
                  lockedRegency: e.target.value
                    ? { id: rules.lockedRegency?.id ?? '', name: e.target.value }
                    : null,
                })
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

  // Input "Nilai" kondisi: jika pertanyaan sumber bertipe pilihan, tampilkan
  // DROPDOWN opsinya (value = nilai opsi yang sama dgn jawaban responden) supaya
  // kondisi benar-benar cocok. Untuk teks/angka, tetap input bebas.
  const choiceTypes = new Set(['single_choice', 'multiple_choice', 'dropdown', 'random_arm']);
  const renderValueInput = (
    sourceQuestionId: string,
    value: string,
    onChange: (v: string) => void,
  ) => {
    const src = others.find((q) => q.id === sourceQuestionId);
    const opts = src && choiceTypes.has(src.type) ? (src.options ?? []) : null;
    if (opts && opts.length > 0) {
      return (
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full px-1.5 py-1 border border-purple-200 rounded text-xs"
        >
          <option value="">— pilih nilai —</option>
          {opts.map((o) => (
            <option key={o.id} value={o.value || o.label}>
              {o.label || o.value}
            </option>
          ))}
        </select>
      );
    }
    return (
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-1.5 py-1 border border-purple-200 rounded text-xs"
        placeholder="nilai..."
      />
    );
  };

  return (
    <div className="space-y-4">
      {/* Penjelasan singkat untuk pengguna awam */}
      <div className="rounded-md bg-gray-50 p-3 text-xs text-gray-600">
        Atur pertanyaan ini agar <b>muncul atau hilang otomatis</b> tergantung jawaban pertanyaan
        sebelumnya. Contoh: tampilkan "Akun Instagram" hanya jika responden menjawab "Ya" pada
        "Punya Instagram?".
      </div>

      {/* Skip Logic */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-xs font-semibold text-purple-700 uppercase tracking-wide">
            Sembunyikan otomatis
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
          <div
            key={idx}
            className="bg-purple-50 border border-purple-100 rounded p-2 mb-2 space-y-2"
          >
            <div className="grid grid-cols-3 gap-1.5">
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">Jika pertanyaan</label>
                <select
                  value={rule.sourceQuestionId}
                  onChange={(e) => {
                    const n = [...skipRules];
                    n[idx] = { ...rule, sourceQuestionId: e.target.value };
                    setSkip(n);
                  }}
                  className="w-full px-1.5 py-1 border border-purple-200 rounded text-xs"
                >
                  <option value="">— pilih —</option>
                  {others.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.text
                        ? q.text.length > 30
                          ? q.text.slice(0, 30) + '…'
                          : q.text
                        : `Q${q.order + 1}`}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">Operator</label>
                <select
                  value={rule.operator}
                  onChange={(e) => {
                    const n = [...skipRules];
                    n[idx] = { ...rule, operator: e.target.value as ConditionOperator };
                    setSkip(n);
                  }}
                  className="w-full px-1.5 py-1 border border-purple-200 rounded text-xs"
                >
                  {(Object.entries(operatorLabels) as [ConditionOperator, string][]).map(
                    ([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ),
                  )}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">Nilai</label>
                {renderValueInput(rule.sourceQuestionId, rule.conditionValue, (v) => {
                  const n = [...skipRules];
                  n[idx] = { ...rule, conditionValue: v };
                  setSkip(n);
                })}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Aksi:</span>
                <select
                  value={rule.action}
                  onChange={(e) => {
                    const n = [...skipRules];
                    n[idx] = { ...rule, action: e.target.value as 'skip' | 'jump_to' };
                    setSkip(n);
                  }}
                  className="px-1.5 py-1 border border-purple-200 rounded text-xs"
                >
                  <option value="skip">Sembunyikan pertanyaan ini</option>
                  <option value="jump_to">Lompat ke pertanyaan lain</option>
                </select>
                {rule.action === 'jump_to' && (
                  <select
                    value={rule.targetQuestionId ?? ''}
                    onChange={(e) => {
                      const n = [...skipRules];
                      n[idx] = { ...rule, targetQuestionId: e.target.value };
                      setSkip(n);
                    }}
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
            Tampilkan otomatis
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
        {visRules.length === 0 && <p className="text-xs text-gray-400 italic">Selalu tampil.</p>}
        {visRules.map((rule, idx) => (
          <div key={idx} className="bg-blue-50 border border-blue-100 rounded p-2 mb-2 space-y-2">
            <div className="grid grid-cols-3 gap-1.5">
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">Jika pertanyaan</label>
                <select
                  value={rule.sourceQuestionId}
                  onChange={(e) => {
                    const n = [...visRules];
                    n[idx] = { ...rule, sourceQuestionId: e.target.value };
                    setVis(n);
                  }}
                  className="w-full px-1.5 py-1 border border-blue-200 rounded text-xs"
                >
                  <option value="">— pilih —</option>
                  {others.map((q) => (
                    <option key={q.id} value={q.id}>
                      {q.text
                        ? q.text.length > 30
                          ? q.text.slice(0, 30) + '…'
                          : q.text
                        : `Q${q.order + 1}`}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">Operator</label>
                <select
                  value={rule.operator}
                  onChange={(e) => {
                    const n = [...visRules];
                    n[idx] = { ...rule, operator: e.target.value as ConditionOperator };
                    setVis(n);
                  }}
                  className="w-full px-1.5 py-1 border border-blue-200 rounded text-xs"
                >
                  {(Object.entries(operatorLabels) as [ConditionOperator, string][]).map(
                    ([k, v]) => (
                      <option key={k} value={k}>
                        {v}
                      </option>
                    ),
                  )}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-0.5">Nilai</label>
                {renderValueInput(rule.sourceQuestionId, rule.conditionValue, (v) => {
                  const n = [...visRules];
                  n[idx] = { ...rule, conditionValue: v };
                  setVis(n);
                })}
              </div>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500">Maka:</span>
                <select
                  value={rule.visibilityAction}
                  onChange={(e) => {
                    const n = [...visRules];
                    n[idx] = { ...rule, visibilityAction: e.target.value as 'show' | 'hide' };
                    setVis(n);
                  }}
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
  expanded,
  onOpen,
  onClose,
}: {
  question: Question;
  index: number;
  onEdit: (q: Question) => void;
  onDelete: (id: string) => void;
  onDuplicate: (q: Question) => void;
  allQuestions: Question[];
  expanded: boolean;
  onOpen: () => void;
  onClose: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: question.id,
  });

  const style = { transform: CSS.Transform.toString(transform), transition };
  // Akordion: hanya satu pertanyaan terbuka sekaligus (dikontrol parent).
  const [tab, setTab] = useState<'edit' | 'logic' | 'validation'>('edit');

  const hasLogic =
    (question.skipLogicRules?.length ?? 0) > 0 || (question.visibilityRules?.length ?? 0) > 0;

  return (
    <div ref={setNodeRef} style={style} className="bg-white border border-gray-200 rounded-lg mb-3">
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
              <span className="text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full">
                Wajib
              </span>
            )}
            {hasLogic && (
              <span className="text-xs bg-purple-100 text-purple-600 px-1.5 py-0.5 rounded-full">
                Aturan
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              setTab('edit');
              onOpen();
            }}
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

      {/* Editor modal (popup) */}
      {expanded && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
          onClick={onClose}
        >
          <div
            className="my-6 w-full max-w-2xl rounded-lg bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
              <h3 className="text-base font-semibold text-gray-900">
                {question.text.trim() ? 'Edit Pertanyaan' : 'Tambah Pertanyaan'}
              </h3>
              <button
                onClick={onClose}
                className="text-lg leading-none text-gray-400 hover:text-gray-600"
                aria-label="Tutup"
              >
                ✕
              </button>
            </div>
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
                  {t === 'edit'
                    ? '✏️ Pertanyaan'
                    : t === 'logic'
                      ? '🔀 Aturan Tampil'
                      : '✅ Batasan Isian'}
                </button>
              ))}
            </div>

            <div className="p-4 space-y-4">
              {tab === 'edit' && (
                <>
                  {/* Teks pertanyaan */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Teks Pertanyaan
                    </label>
                    <textarea
                      value={question.text}
                      onChange={(e) => onEdit({ ...question, text: e.target.value })}
                      rows={2}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
                      placeholder="Tulis pertanyaan di sini..."
                    />
                  </div>

                  {/* Tipe pertanyaan (ubah → reset konfigurasi tipe) */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Tipe Pertanyaan
                    </label>
                    <select
                      value={question.type}
                      onChange={(e) => {
                        const t = e.target.value as QuestionType;
                        onEdit({
                          ...question,
                          type: t,
                          options: undefined,
                          validationRules: question.validationRules?.description
                            ? { description: question.validationRules.description }
                            : undefined,
                          ...defaultsForType(t),
                        });
                      }}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
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

                  {/* Deskripsi */}
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      Deskripsi (opsional)
                    </label>
                    <input
                      type="text"
                      value={question.validationRules?.description ?? ''}
                      onChange={(e) =>
                        onEdit({
                          ...question,
                          validationRules: {
                            ...question.validationRules,
                            description: e.target.value,
                          },
                        })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
                      placeholder="Penjelasan tambahan untuk responden..."
                    />
                  </div>

                  {/* Status pertanyaan: Wajib / Opsional / Nonaktif */}
                  <div>
                    <label className="mb-1 block text-xs font-medium text-gray-600">
                      Status pertanyaan
                    </label>
                    <div className="inline-flex rounded-md border border-gray-300 p-0.5">
                      {(
                        [
                          { key: 'required', label: 'Wajib' },
                          { key: 'optional', label: 'Opsional' },
                          { key: 'disabled', label: 'Nonaktif' },
                        ] as const
                      ).map((opt) => {
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
                              if (opt.key === 'required')
                                onEdit({ ...question, required: true, enabled: true });
                              else if (opt.key === 'optional')
                                onEdit({ ...question, required: false, enabled: true });
                              else onEdit({ ...question, enabled: false });
                            }}
                            className={`rounded px-3 py-1.5 text-xs font-medium transition-colors ${
                              active
                                ? 'bg-primary-600 text-white'
                                : 'text-gray-600 hover:bg-gray-100'
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
                  {(question.type === 'single_choice' ||
                    question.type === 'multiple_choice' ||
                    question.type === 'dropdown') && (
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
                  {question.type === 'random_arm' && (
                    <ArmConfig question={question} onEdit={onEdit} />
                  )}
                </>
              )}

              {tab === 'logic' && (
                <LogicEditor question={question} allQuestions={allQuestions} onEdit={onEdit} />
              )}

              {tab === 'validation' && (
                <div className="space-y-3">
                  <p className="rounded-md bg-gray-50 p-3 text-xs text-gray-600">
                    Batasan untuk jawaban (mis. panjang minimal/maksimal). Semua opsional — boleh
                    dibiarkan kosong bila tidak diperlukan.
                  </p>
                  {(question.type === 'short_text' || question.type === 'long_text') && (
                    <>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Min Karakter
                          </label>
                          <input
                            type="number"
                            value={question.validationRules?.minLength ?? ''}
                            onChange={(e) =>
                              onEdit({
                                ...question,
                                validationRules: {
                                  ...question.validationRules,
                                  minLength: e.target.value ? Number(e.target.value) : undefined,
                                },
                              })
                            }
                            className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                            min={0}
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">
                            Maks Karakter
                          </label>
                          <input
                            type="number"
                            value={question.validationRules?.maxLength ?? ''}
                            onChange={(e) =>
                              onEdit({
                                ...question,
                                validationRules: {
                                  ...question.validationRules,
                                  maxLength: e.target.value ? Number(e.target.value) : undefined,
                                },
                              })
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
                            onChange={(e) =>
                              onEdit({
                                ...question,
                                validationRules: {
                                  ...question.validationRules,
                                  emailFormat: e.target.checked,
                                },
                              })
                            }
                            className="rounded"
                          />
                          Validasi format email
                        </label>
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Pola Regex (lanjutan)
                          <InfoHint text="Khusus pengguna mahir — pola pencocokan teks. Biarkan kosong jika tidak paham." />
                        </label>
                        <input
                          type="text"
                          value={question.validationRules?.regex ?? ''}
                          onChange={(e) =>
                            onEdit({
                              ...question,
                              validationRules: {
                                ...question.validationRules,
                                regex: e.target.value,
                              },
                            })
                          }
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm font-mono"
                          placeholder="^\d{5}$"
                        />
                      </div>
                    </>
                  )}
                  {question.type === 'multiple_choice' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Min Pilihan
                        </label>
                        <input
                          type="number"
                          value={question.validationRules?.minCheckbox ?? ''}
                          onChange={(e) =>
                            onEdit({
                              ...question,
                              validationRules: {
                                ...question.validationRules,
                                minCheckbox: e.target.value ? Number(e.target.value) : undefined,
                              },
                            })
                          }
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                          min={1}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">
                          Maks Pilihan
                        </label>
                        <input
                          type="number"
                          value={question.validationRules?.maxCheckbox ?? ''}
                          onChange={(e) =>
                            onEdit({
                              ...question,
                              validationRules: {
                                ...question.validationRules,
                                maxCheckbox: e.target.value ? Number(e.target.value) : undefined,
                              },
                            })
                          }
                          className="w-full px-2 py-1.5 border border-gray-300 rounded text-sm"
                          min={1}
                        />
                      </div>
                    </div>
                  )}
                  {!['short_text', 'long_text', 'multiple_choice'].includes(question.type) && (
                    <p className="text-xs text-gray-400 italic">
                      Tidak ada opsi validasi tambahan untuk tipe ini.
                    </p>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center justify-between border-t border-gray-100 px-5 py-3">
              <button
                onClick={() => onDelete(question.id)}
                className="text-xs font-medium text-red-600 hover:text-red-700"
              >
                Hapus pertanyaan
              </button>
              <button
                onClick={onClose}
                className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700"
              >
                Tutup
              </button>
            </div>
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
  // Akordion: id pertanyaan yang sedang terbuka (hanya satu sekaligus).
  const [expandedId, setExpandedId] = useState<string | null>(null);
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
      setSaveMessage({ ok: true, text: 'Pengaturan survei disimpan ✓' });
    } catch (e) {
      // Tampilkan pesan asli dari server (mis. validasi) agar mudah didiagnosis.
      const msg = (e as { message?: string })?.message;
      setSaveMessage({
        ok: false,
        text: msg ? `Gagal menyimpan: ${msg}` : 'Gagal menyimpan pengaturan ✗',
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

  const persistQuestions = async (successText: string) => {
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
    void persistQuestions('Tersimpan otomatis ✓');
  };

  if (loading) {
    return <div className="p-6 text-center text-gray-500">Memuat survei...</div>;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/admin/surveys')}
            className="text-gray-600 hover:text-gray-900 text-sm"
          >
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

      {/* Informasi Survei — judul, deskripsi, jadwal (bisa diedit, mis. survei duplikat) */}
      <div className="rounded-lg border border-gray-200 bg-white p-5">
        <h2 className="mb-3 text-sm font-semibold text-gray-900">Informasi Survei</h2>
        <div className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Judul Survei</label>
            <input
              type="text"
              value={settingsTitle}
              onChange={(e) => setSettingsTitle(e.target.value)}
              placeholder="Masukkan judul survei"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Deskripsi</label>
            <textarea
              value={settingsDescription}
              onChange={(e) => setSettingsDescription(e.target.value)}
              placeholder="Deskripsi survei"
              rows={3}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Tanggal Mulai</label>
              <input
                type="datetime-local"
                value={settingsStartDate}
                onChange={(e) => setSettingsStartDate(e.target.value)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
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
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
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
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
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
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Cara Menampilkan Pertanyaan
              <InfoHint text="Mengatur bagaimana pertanyaan muncul ke responden: per halaman, semua sekaligus, atau satu per satu." />
            </label>
            <select
              value={settingsFormMode}
              onChange={(e) => setSettingsFormMode(e.target.value as typeof settingsFormMode)}
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="paginated">Per Halaman (beberapa pertanyaan per halaman)</option>
              <option value="scroll">Satu Halaman (gulir ke bawah)</option>
              <option value="wizard">Satu per Satu (1 pertanyaan tiap langkah)</option>
            </select>
          </div>
        </div>

        {/* Reward — poin & deskripsi dapat diubah agar survei tidak mubazir */}
        <div className="mt-4 border-t border-gray-100 pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Reward
            <InfoHint text="Hadiah untuk responden yang menyelesaikan survei. Bisa diubah kapan saja, termasuk setelah survei dibuat." />
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Mode Reward</label>
              <select
                value={settingsRewardMode}
                onChange={(e) => setSettingsRewardMode(e.target.value as typeof settingsRewardMode)}
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
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
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
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
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
          </div>
        </div>

        {/* Alat pendukung — bukan tipe pertanyaan, melainkan setelan survei */}
        <div className="mt-4 border-t border-gray-100 pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Fitur Tambahan
            <InfoHint text="Fitur opsional yang berlaku untuk seluruh survei, mis. merekam lokasi GPS atau meminta tanda tangan." />
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="flex cursor-pointer items-start gap-3 rounded-md border border-gray-200 p-3 hover:bg-gray-50">
              <input
                type="checkbox"
                checked={settingsCaptureGps}
                onChange={(e) => setSettingsCaptureGps(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm">
                <span className="block font-medium text-gray-800">Rekam lokasi GPS</span>
                <span className="block text-xs text-gray-500">
                  Tangkap koordinat otomatis di awal &amp; akhir pengisian.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-md border border-gray-200 p-3 hover:bg-gray-50">
              <input
                type="checkbox"
                checked={settingsRequireSignature}
                onChange={(e) => setSettingsRequireSignature(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm">
                <span className="block font-medium text-gray-800">Tanda tangan responden</span>
                <span className="block text-xs text-gray-500">
                  Minta tanda tangan di akhir sebagai verifikasi/persetujuan.
                </span>
              </span>
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-md border border-gray-200 p-3 hover:bg-gray-50">
              <input
                type="checkbox"
                checked={settingsUppercaseAnswers}
                onChange={(e) => setSettingsUppercaseAnswers(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm">
                <span className="block font-medium text-gray-800">
                  Huruf besar semua jawaban teks
                </span>
                <span className="block text-xs text-gray-500">
                  Jawaban teks &amp; isian responden otomatis jadi HURUF BESAR.
                </span>
              </span>
            </label>
          </div>
        </div>

        {/* Limitasi & Targeting */}
        <div className="mt-4 border-t border-gray-100 pt-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-400">
            Limitasi &amp; Targeting
          </p>
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
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Khusus jenis kelamin
              </label>
              <div className="flex flex-wrap gap-3 pt-1.5">
                {[
                  { v: 'male', l: 'Laki-laki' },
                  { v: 'female', l: 'Perempuan' },
                  { v: 'other', l: 'Lainnya' },
                ].map((g) => (
                  <label key={g.v} className="inline-flex items-center gap-1.5 text-sm">
                    <input
                      type="checkbox"
                      checked={settingsAllowedGenders.includes(g.v)}
                      onChange={(e) =>
                        setSettingsAllowedGenders((prev) =>
                          e.target.checked ? [...prev, g.v] : prev.filter((x) => x !== g.v),
                        )
                      }
                      className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    {g.l}
                  </label>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-gray-400">Kosong = semua jenis kelamin.</p>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">
                Khusus provinsi{' '}
                {settingsAllowedProvinces.length > 0 && `(${settingsAllowedProvinces.length})`}
              </label>
              <div className="max-h-32 overflow-y-auto rounded-md border border-gray-300 p-2">
                {provinceList.length === 0 && (
                  <p className="text-xs text-gray-400">Memuat provinsi…</p>
                )}
                {provinceList.map((p) => (
                  <label key={p.id} className="flex items-center gap-1.5 py-0.5 text-xs">
                    <input
                      type="checkbox"
                      checked={settingsAllowedProvinces.includes(p.name)}
                      onChange={(e) =>
                        setSettingsAllowedProvinces((prev) =>
                          e.target.checked ? [...prev, p.name] : prev.filter((x) => x !== p.name),
                        )
                      }
                      className="h-3.5 w-3.5 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
                    />
                    {p.name}
                  </label>
                ))}
              </div>
              <p className="mt-1 text-[11px] text-gray-400">Kosong = semua wilayah.</p>
            </div>
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
            <button
              onClick={handleDownloadTemplate}
              title="Unduh contoh format Excel untuk diisi"
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
            >
              Template
            </button>
            <button
              onClick={handleExportQuestions}
              title="Unduh pertanyaan survei ini ke Excel"
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100"
            >
              Unduh
            </button>
            <button
              onClick={() => importInputRef.current?.click()}
              title="Unggah pertanyaan dari file Excel (ditambahkan di bawah)"
              className="rounded-md border border-primary-300 bg-primary-50 px-3 py-2 text-sm font-medium text-primary-700 transition-colors hover:bg-primary-100"
            >
              Unggah
            </button>
            <button
              onClick={() => addQuestion('single_choice')}
              className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700"
            >
              + Tambah Pertanyaan
            </button>
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
          <div className="rounded-md border border-dashed border-gray-200 py-10 text-center text-sm text-gray-400">
            Belum ada pertanyaan. Klik &ldquo;+ Tambah Pertanyaan&rdquo; di atas.
          </div>
        )}
      </div>
    </div>
  );
}
