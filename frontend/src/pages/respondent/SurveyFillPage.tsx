import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate, useBlocker } from 'react-router-dom';
import { getPosition } from '@/utils/geo';
import {
  Timer,
  Gift,
  CheckCircle2,
  Upload,
  FileCheck2,
  X,
  ChevronLeft,
  ChevronRight,
  Send,
  AlertCircle,
  Loader2,
  Star,
  MapPin,
  Camera,
  Mic,
  Square,
  Trash2,
  WifiOff,
  CloudUpload,
  RefreshCw,
} from 'lucide-react';
import { api } from '@/services/api';
import {
  useMediaUpload,
  MediaUploadProvider,
  type UploadMediaFn,
} from '@/contexts/MediaUploadContext';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import {
  cachePut,
  cacheGet,
  queueAdd,
  makeLocalId,
  mediaPut,
  LOCAL_MEDIA_PREFIX,
} from '@/utils/offlineQueue';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import {
  getProvinces,
  getRegencies,
  getDistricts,
  getVillages,
  type WilayahItem,
} from '@/utils/wilayah';

// Types
interface SurveyOption {
  id: string;
  label: string;
  value: string;
}

interface SkipCondition {
  questionId: string;
  operator: 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than';
  value: string;
}

interface RegionConfig {
  regionDepth?: 'province' | 'regency' | 'district' | 'village';
  lockedProvince?: { id: string; name: string } | null;
  lockedRegency?: { id: string; name: string } | null;
}

interface RatingConfig {
  ratingMax?: number;
  ratingDisplayMode?: 'star' | 'number';
  ratingMinLabel?: string;
  ratingMaxLabel?: string;
}

export interface Question {
  id: string;
  type:
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
  text: string;
  description?: string;
  required: boolean;
  options?: SurveyOption[];
  matrixRows?: string[];
  matrixColumns?: string[];
  scaleMin?: number;
  scaleMax?: number;
  randomizeOptions?: boolean;
  hasOtherOption?: boolean;
  skipConditions?: SkipCondition[];
  visibilityConditions?: SkipCondition[];
  page: number;
  regionConfig?: RegionConfig;
  ratingConfig?: RatingConfig;
  uniqueIdConfig?: { minLength?: number; maxLength?: number };
}

interface SurveyFillData {
  id: string;
  title: string;
  description: string;
  questions: Question[];
  totalPages: number;
  /** Mode tampilan form: paginated (default), scroll, atau wizard (1 pertanyaan/langkah). */
  formMode?: 'paginated' | 'scroll' | 'wizard';
  /** Rekam lokasi GPS otomatis (awal & akhir). Default false bila tak diset. */
  captureGps?: boolean;
  /** Minta tanda tangan responden di akhir pengisian. */
  requireSignature?: boolean;
  /** Jadikan jawaban teks (short_text/long_text) HURUF BESAR. */
  uppercaseAnswers?: boolean;
  maxDuration?: number; // in minutes
  rewardMode: 'auto_point' | 'manual';
  rewardPoints?: number;
  rewardDescription?: string;
  responseId: string;
  /**
   * Nilai pra-isi dari server (saat ini: penugasan acak / arm eksperimen),
   * questionId → nilai. Ditanam ke peta jawaban agar aturan tampil cabang jalan.
   */
  assignments?: Record<string, string>;
}

export type AnswerValue = string | string[] | Record<string, any> | null;

export const DEVICE_TYPE = /Mobi|Android|iPhone|iPad/i.test(
  typeof navigator !== 'undefined' ? navigator.userAgent : '',
)
  ? 'mobile'
  : 'desktop';

/**
 * Rekam koordinat GPS sekali (best-effort). Tidak pernah throw — resolve null
 * bila izin ditolak / tidak didukung / timeout, agar pengisian tetap berjalan.
 */
export function captureGeo(): Promise<{ lat: number; lng: number } | null> {
  // getPosition() menangani native (plugin + izin lokasi) maupun web.
  return getPosition({ enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }).then((p) =>
    p ? { lat: p.latitude, lng: p.longitude } : null,
  );
}

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

export function isAnswered(value: AnswerValue): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return false;
}

// ─── Question Renderers ───────────────────────────────────────────────────────

interface RendererProps {
  question: Question;
  value: AnswerValue;
  onChange: (val: AnswerValue) => void;
  surveyId: string;
  invalid?: boolean;
  /** Setelan survei: jadikan jawaban teks bebas HURUF BESAR saat diketik. */
  uppercase?: boolean;
}

/** Terapkan UPPERCASE bila setelan aktif (untuk input teks bebas). */
function maybeUpper(text: string, uppercase?: boolean): string {
  return uppercase ? text.toUpperCase() : text;
}

/**
 * Urutkan opsi: acak (stabil per pertanyaan) bila randomizeOptions aktif.
 * useMemo mencegah pengacakan ulang setiap render (mis. saat mengetik/memilih).
 */
function useOrderedOptions(question: Question): SurveyOption[] {
  return useMemo(
    () =>
      question.randomizeOptions ? shuffleArray(question.options ?? []) : (question.options ?? []),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [question.id, question.randomizeOptions, question.options],
  );
}

const choiceRowClasses = (selected: boolean) =>
  `flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${
    selected
      ? 'border-primary-500 bg-primary-50 ring-1 ring-primary-500'
      : 'border-gray-200 hover:bg-gray-50'
  }`;

function SingleChoiceQuestion({ question, value, onChange, uppercase }: RendererProps) {
  const options = useOrderedOptions(question);
  const optionValues = (question.options ?? []).map((o) => o.value);
  const strVal = typeof value === 'string' ? value : '';
  const otherFromValue = strVal !== '' && !optionValues.includes(strVal);

  const [otherActive, setOtherActive] = useState(otherFromValue);
  const [otherText, setOtherText] = useState(otherFromValue ? strVal : '');
  const otherChecked = otherActive || otherFromValue;

  return (
    <div className="space-y-2">
      {options.map((opt) => {
        const selected = !otherChecked && value === opt.value;
        return (
          <label key={opt.id} className={choiceRowClasses(selected)}>
            <input
              type="radio"
              name={question.id}
              value={opt.value}
              checked={selected}
              onChange={() => {
                setOtherActive(false);
                onChange(opt.value);
              }}
              className="h-4 w-4 accent-primary-600"
            />
            <span className="text-sm text-gray-800">{opt.label}</span>
          </label>
        );
      })}

      {question.hasOtherOption && (
        <label className={choiceRowClasses(otherChecked)}>
          <input
            type="radio"
            name={question.id}
            checked={otherChecked}
            onChange={() => {
              setOtherActive(true);
              onChange(otherText.trim() ? otherText : '');
            }}
            className="h-4 w-4 accent-primary-600"
          />
          <span className="text-sm text-gray-800">Lainnya:</span>
          <input
            type="text"
            value={otherText}
            placeholder="tulis jawaban Anda…"
            onChange={(e) => {
              const t = maybeUpper(e.target.value, uppercase);
              setOtherText(t);
              setOtherActive(true);
              onChange(t.trim() ? t : '');
            }}
            onFocus={() => setOtherActive(true)}
            className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </label>
      )}
    </div>
  );
}

function MultipleChoiceQuestion({ question, value, onChange, uppercase }: RendererProps) {
  const selected = Array.isArray(value) ? value : [];
  const options = useOrderedOptions(question);
  const optionValues = (question.options ?? []).map((o) => o.value);

  const predefinedSelected = selected.filter((v) => optionValues.includes(v));
  const existingOther = selected.find((v) => !optionValues.includes(v)) ?? '';

  const [otherChecked, setOtherChecked] = useState(existingOther !== '');
  const [otherText, setOtherText] = useState(existingOther);

  const commit = (preds: string[], active: boolean, text: string) => {
    onChange([...preds, ...(active && text.trim() ? [text] : [])]);
  };

  const togglePredefined = (optValue: string) => {
    const next = predefinedSelected.includes(optValue)
      ? predefinedSelected.filter((v) => v !== optValue)
      : [...predefinedSelected, optValue];
    commit(next, otherChecked, otherText);
  };

  return (
    <div className="space-y-2">
      {options.map((opt) => {
        const isSel = predefinedSelected.includes(opt.value);
        return (
          <label key={opt.id} className={choiceRowClasses(isSel)}>
            <input
              type="checkbox"
              value={opt.value}
              checked={isSel}
              onChange={() => togglePredefined(opt.value)}
              className="h-4 w-4 rounded accent-primary-600"
            />
            <span className="text-sm text-gray-800">{opt.label}</span>
          </label>
        );
      })}

      {question.hasOtherOption && (
        <label className={choiceRowClasses(otherChecked)}>
          <input
            type="checkbox"
            checked={otherChecked}
            onChange={() => {
              const next = !otherChecked;
              setOtherChecked(next);
              commit(predefinedSelected, next, otherText);
            }}
            className="h-4 w-4 rounded accent-primary-600"
          />
          <span className="text-sm text-gray-800">Lainnya:</span>
          <input
            type="text"
            value={otherText}
            placeholder="tulis jawaban Anda…"
            onChange={(e) => {
              const t = maybeUpper(e.target.value, uppercase);
              setOtherText(t);
              setOtherChecked(true);
              commit(predefinedSelected, true, t);
            }}
            onFocus={() => setOtherChecked(true)}
            className="flex-1 rounded-md border border-gray-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-primary-500"
          />
        </label>
      )}
    </div>
  );
}

const textFieldBase =
  'w-full rounded-lg border bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm transition-colors placeholder:text-gray-400 focus:outline-none focus:ring-2';

function fieldClasses(invalid?: boolean): string {
  return `${textFieldBase} ${
    invalid
      ? 'border-red-300 focus:border-red-400 focus:ring-red-500/40'
      : 'border-gray-300 hover:border-gray-400 focus:border-primary-500 focus:ring-primary-500/40'
  }`;
}

function ShortTextQuestion({ question, value, onChange, invalid, uppercase }: RendererProps) {
  return (
    <input
      type="text"
      value={(value as string) ?? ''}
      onChange={(e) => onChange(maybeUpper(e.target.value, uppercase))}
      placeholder="Ketik jawaban Anda..."
      className={fieldClasses(invalid)}
      aria-label={question.text}
    />
  );
}

function LongTextQuestion({ question, value, onChange, invalid, uppercase }: RendererProps) {
  return (
    <textarea
      value={(value as string) ?? ''}
      onChange={(e) => onChange(maybeUpper(e.target.value, uppercase))}
      placeholder="Ketik jawaban Anda..."
      rows={4}
      className={`${fieldClasses(invalid)} resize-y`}
      aria-label={question.text}
    />
  );
}

// Panjang maksimum nomor (tanpa +62). Nomor Indonesia umumnya 9–13 digit;
// 15 sebagai batas aman untuk mengurangi salah ketik.
const PHONE_MAX_DIGITS = 15;

function PhoneNumberQuestion({ question, value, onChange, invalid }: RendererProps) {
  const current = (value as string) ?? '';
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="rounded-lg border border-gray-300 bg-gray-100 px-3 py-2.5 text-sm text-gray-600">
          +62
        </span>
        <input
          type="tel"
          inputMode="numeric"
          maxLength={PHONE_MAX_DIGITS}
          value={current}
          onChange={(e) =>
            onChange(e.target.value.replace(/[^0-9]/g, '').slice(0, PHONE_MAX_DIGITS))
          }
          placeholder="8xxxxxxxxxx"
          className={`flex-1 ${fieldClasses(invalid)}`}
          aria-label={question.text}
        />
      </div>
      <p className="mt-1 text-xs text-gray-400">
        Hanya angka, maksimal {PHONE_MAX_DIGITS} digit ({current.length}/{PHONE_MAX_DIGITS}).
      </p>
    </div>
  );
}

function NumericScaleQuestion({ question, value, onChange, invalid }: RendererProps) {
  const min = question.scaleMin ?? 1;
  const max = question.scaleMax ?? 10;
  const count = Math.max(0, max - min + 1);
  const numbers = Array.from({ length: count }, (_, i) => min + i);

  return (
    <div>
      <select
        value={(value as string) ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        className={fieldClasses(invalid)}
        aria-label={question.text}
      >
        <option value="">Pilih angka...</option>
        {numbers.map((num) => (
          <option key={num} value={String(num)}>
            {num}
          </option>
        ))}
      </select>
      <p className="mt-1 text-xs text-gray-400">
        Pilih angka {min} sampai {max}.
      </p>
    </div>
  );
}

function DropdownQuestion({ question, value, onChange, invalid }: RendererProps) {
  const options = useOrderedOptions(question);

  return (
    <select
      value={(value as string) ?? ''}
      onChange={(e) => onChange(e.target.value || null)}
      className={fieldClasses(invalid)}
      aria-label={question.text}
    >
      <option value="">Pilih jawaban...</option>
      {options.map((opt) => (
        <option key={opt.id} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  );
}

function MatrixLikertQuestion({ question, value, onChange }: RendererProps) {
  const rows = question.matrixRows ?? [];
  const columns = question.matrixColumns ?? [];
  const answers = (value as Record<string, string>) ?? {};

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="min-w-full">
        <thead>
          <tr className="bg-gray-50/60">
            <th className="px-3 py-2.5 text-left text-xs font-medium text-gray-500" />
            {columns.map((col) => (
              <th key={col} className="px-3 py-2.5 text-center text-xs font-medium text-gray-500">
                {col}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row) => (
            <tr key={row} className="hover:bg-gray-50/50">
              <td className="px-3 py-3 text-sm text-gray-700">{row}</td>
              {columns.map((col) => (
                <td key={col} className="px-3 py-3 text-center">
                  <input
                    type="radio"
                    name={`${question.id}-${row}`}
                    checked={answers[row] === col}
                    onChange={() => onChange({ ...answers, [row]: col })}
                    className="h-4 w-4 accent-primary-600"
                    aria-label={`${row} - ${col}`}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function FileUploadQuestion({ question, value, onChange, surveyId, invalid }: RendererProps) {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState<string>(value ? 'Berkas terunggah' : '');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const uploadMedia = useMediaUpload();

  const uploadFile = async (file: File) => {
    setUploadError(null);
    setUploading(true);
    try {
      const answerValue = await uploadMedia(file, surveyId, file.name);
      onChange(answerValue); // object key (online) atau referensi lokal (offline)
      setFileName(file.name);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setUploadError(e.message || 'Gagal mengunggah berkas.');
      onChange(null);
      setFileName('');
    } finally {
      setUploading(false);
    }
  };

  const clearFile = () => {
    onChange(null);
    setFileName('');
    setUploadError(null);
  };

  return (
    <div className="space-y-2">
      <div
        className={`rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
          dragOver
            ? 'border-primary-500 bg-primary-50'
            : invalid
              ? 'border-red-300'
              : 'border-gray-300'
        }`}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          const file = e.dataTransfer.files[0];
          if (file) void uploadFile(file);
        }}
      >
        {uploading ? (
          <div className="flex items-center justify-center gap-2 text-sm text-gray-600">
            <Loader2 className="h-4 w-4 animate-spin" /> Mengunggah...
          </div>
        ) : fileName ? (
          <div className="flex items-center justify-center gap-3">
            <FileCheck2 className="h-5 w-5 text-emerald-600" />
            <span className="text-sm font-medium text-gray-800">{fileName}</span>
            <button
              type="button"
              onClick={clearFile}
              className="inline-flex items-center gap-1 text-sm text-red-500 hover:text-red-700"
            >
              <X className="h-3.5 w-3.5" /> Hapus
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <Upload className="mx-auto h-6 w-6 text-gray-400" />
            <p className="text-sm text-gray-500">Tarik &amp; lepas berkas di sini, atau</p>
            <label className="inline-block cursor-pointer">
              <span className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700">
                <Upload className="h-4 w-4" /> Pilih Berkas
              </span>
              <input
                type="file"
                className="hidden"
                accept="image/png,image/jpeg,image/gif,image/webp,application/pdf"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void uploadFile(file);
                }}
                aria-label={question.text}
              />
            </label>
            <p className="text-xs text-gray-400">PNG, JPG, GIF, WEBP, atau PDF · maks 5 MB</p>
          </div>
        )}
      </div>
      {uploadError && (
        <p className="flex items-center gap-1.5 text-sm text-red-600">
          <AlertCircle className="h-3.5 w-3.5" /> {uploadError}
        </p>
      )}
    </div>
  );
}

function DateTimeQuestion({ question, value, onChange, invalid }: RendererProps) {
  return (
    <input
      type="datetime-local"
      value={(value as string) ?? ''}
      onChange={(e) => onChange(e.target.value)}
      className={fieldClasses(invalid)}
      aria-label={question.text}
    />
  );
}

function DateQuestion({ question, value, onChange, invalid }: RendererProps) {
  return (
    <input
      type="date"
      value={(value as string) ?? ''}
      onChange={(e) => onChange(e.target.value)}
      className={fieldClasses(invalid)}
      aria-label={question.text}
    />
  );
}

function UniqueIdQuestion({ question, value, onChange, invalid }: RendererProps) {
  const min = question.uniqueIdConfig?.minLength;
  const max = question.uniqueIdConfig?.maxLength;
  return (
    <div className="space-y-1">
      <input
        type="text"
        inputMode="numeric"
        value={(value as string) ?? ''}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ''))}
        placeholder="Masukkan ID unik (hanya angka)..."
        maxLength={max}
        className={fieldClasses(invalid)}
        aria-label={question.text}
      />
      {(min || max) && (
        <p className="text-xs text-gray-400">
          {min && max ? `${min}–${max} digit` : min ? `min ${min} digit` : `maks ${max} digit`}
        </p>
      )}
    </div>
  );
}

function RatingScaleQuestion({ question, value, onChange }: RendererProps) {
  const cfg = question.ratingConfig;
  const max = cfg?.ratingMax ?? 5;
  const mode = cfg?.ratingDisplayMode ?? 'star';
  const current = value ? Number(value) : 0;

  return (
    <div className="space-y-2">
      {mode === 'star' ? (
        <div className="flex gap-1">
          {Array.from({ length: max }, (_, i) => i + 1).map((num) => (
            <button
              key={num}
              type="button"
              onClick={() => onChange(String(num))}
              className={`transition-all ${num <= current ? 'text-yellow-400' : 'text-gray-300'} hover:scale-110`}
              aria-label={`Rating ${num}`}
            >
              <Star className="h-8 w-8" fill={num <= current ? 'currentColor' : 'none'} />
            </button>
          ))}
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: max }, (_, i) => i + 1).map((num) => {
            const sel = current === num;
            return (
              <button
                key={num}
                type="button"
                onClick={() => onChange(String(num))}
                className={`h-11 w-11 rounded-lg border text-sm font-semibold transition-all ${
                  sel
                    ? 'border-primary-600 bg-primary-600 text-white shadow-sm'
                    : 'border-gray-300 bg-white text-gray-700 hover:border-primary-300 hover:bg-primary-50'
                }`}
              >
                {num}
              </button>
            );
          })}
        </div>
      )}
      {(cfg?.ratingMinLabel || cfg?.ratingMaxLabel) && (
        <div className="flex justify-between text-xs text-gray-400">
          <span>{cfg?.ratingMinLabel ?? ''}</span>
          <span>{cfg?.ratingMaxLabel ?? ''}</span>
        </div>
      )}
      {current > 0 && (
        <p className="text-sm text-gray-500">
          Anda memilih: <span className="font-semibold text-primary-700">{current}</span>
          {mode === 'star' && ' bintang'}
        </p>
      )}
    </div>
  );
}

type RegionValue = {
  province_id?: string;
  province_name?: string;
  regency_id?: string;
  regency_name?: string;
  district_id?: string;
  district_name?: string;
  village_id?: string;
  village_name?: string;
};

function IndonesiaRegionQuestion({ question, value, onChange, invalid }: RendererProps) {
  const cfg = question.regionConfig;
  const depth = cfg?.regionDepth ?? 'village';
  const lockedProvince = cfg?.lockedProvince;
  const lockedRegency = cfg?.lockedRegency;

  const regionVal = (value as RegionValue) ?? {};

  const [provinces, setProvinces] = useState<WilayahItem[]>([]);
  const [regencies, setRegencies] = useState<WilayahItem[]>([]);
  const [districts, setDistricts] = useState<WilayahItem[]>([]);
  const [villages, setVillages] = useState<WilayahItem[]>([]);
  const [loadingLevel, setLoadingLevel] = useState<string | null>(null);

  const depthOrder = ['province', 'regency', 'district', 'village'];
  const depthIndex = depthOrder.indexOf(depth);

  // Load provinces (unless locked)
  useEffect(() => {
    if (lockedProvince) {
      setProvinces([lockedProvince]);
      return;
    }
    setLoadingLevel('province');
    getProvinces()
      .then(setProvinces)
      .catch(() => setProvinces([]))
      .finally(() => setLoadingLevel(null));
  }, [lockedProvince]);

  // Load regencies when province is selected
  useEffect(() => {
    const provId = lockedProvince?.id ?? regionVal.province_id;
    if (!provId || depthIndex < 1) return;
    if (lockedRegency) {
      setRegencies([lockedRegency]);
      return;
    }
    setLoadingLevel('regency');
    getRegencies(provId)
      .then(setRegencies)
      .catch(() => setRegencies([]))
      .finally(() => setLoadingLevel(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionVal.province_id, lockedProvince, lockedRegency, depthIndex]);

  // Load districts when regency is selected
  useEffect(() => {
    const regId = lockedRegency?.id ?? regionVal.regency_id;
    if (!regId || depthIndex < 2) return;
    setLoadingLevel('district');
    getDistricts(regId)
      .then(setDistricts)
      .catch(() => setDistricts([]))
      .finally(() => setLoadingLevel(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionVal.regency_id, lockedRegency, depthIndex]);

  // Load villages when district is selected
  useEffect(() => {
    const distId = regionVal.district_id;
    if (!distId || depthIndex < 3) return;
    setLoadingLevel('village');
    getVillages(distId)
      .then(setVillages)
      .catch(() => setVillages([]))
      .finally(() => setLoadingLevel(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionVal.district_id, depthIndex]);

  const selectStyle = fieldClasses(invalid);

  const setField = (updates: Partial<RegionValue>) => {
    onChange({ ...regionVal, ...updates });
  };

  const clearBelow = (level: 'province' | 'regency' | 'district') => {
    const clears: Partial<RegionValue> = {};
    if (level === 'province') {
      clears.regency_id = undefined;
      clears.regency_name = undefined;
      clears.district_id = undefined;
      clears.district_name = undefined;
      clears.village_id = undefined;
      clears.village_name = undefined;
      setRegencies([]);
      setDistricts([]);
      setVillages([]);
    } else if (level === 'regency') {
      clears.district_id = undefined;
      clears.district_name = undefined;
      clears.village_id = undefined;
      clears.village_name = undefined;
      setDistricts([]);
      setVillages([]);
    } else {
      clears.village_id = undefined;
      clears.village_name = undefined;
      setVillages([]);
    }
    return clears;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 text-xs text-gray-500">
        <MapPin className="h-3.5 w-3.5" />
        Pilih wilayah secara berurutan
      </div>

      {/* Provinsi */}
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">Provinsi</label>
        <select
          value={lockedProvince ? lockedProvince.id : (regionVal.province_id ?? '')}
          disabled={!!lockedProvince || loadingLevel === 'province'}
          onChange={(e) => {
            const item = provinces.find((p) => p.id === e.target.value);
            setField({
              province_id: item?.id,
              province_name: item?.name,
              ...clearBelow('province'),
            });
          }}
          className={selectStyle}
        >
          <option value="">
            {loadingLevel === 'province' ? 'Memuat...' : '— Pilih Provinsi —'}
          </option>
          {provinces.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* Kabupaten/Kota */}
      {depthIndex >= 1 && (
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Kabupaten / Kota</label>
          <select
            value={lockedRegency ? lockedRegency.id : (regionVal.regency_id ?? '')}
            disabled={!!lockedRegency || !regionVal.province_id || loadingLevel === 'regency'}
            onChange={(e) => {
              const item = regencies.find((r) => r.id === e.target.value);
              setField({
                regency_id: item?.id,
                regency_name: item?.name,
                ...clearBelow('regency'),
              });
            }}
            className={selectStyle}
          >
            <option value="">
              {loadingLevel === 'regency'
                ? 'Memuat...'
                : !regionVal.province_id
                  ? '— Pilih provinsi dulu —'
                  : '— Pilih Kabupaten/Kota —'}
            </option>
            {regencies.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Kecamatan */}
      {depthIndex >= 2 && (
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Kecamatan</label>
          <select
            value={regionVal.district_id ?? ''}
            disabled={!regionVal.regency_id || loadingLevel === 'district'}
            onChange={(e) => {
              const item = districts.find((d) => d.id === e.target.value);
              setField({
                district_id: item?.id,
                district_name: item?.name,
                ...clearBelow('district'),
              });
            }}
            className={selectStyle}
          >
            <option value="">
              {loadingLevel === 'district'
                ? 'Memuat...'
                : !regionVal.regency_id
                  ? '— Pilih kabupaten/kota dulu —'
                  : '— Pilih Kecamatan —'}
            </option>
            {districts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Kelurahan/Desa */}
      {depthIndex >= 3 && (
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Kelurahan / Desa</label>
          <select
            value={regionVal.village_id ?? ''}
            disabled={!regionVal.district_id || loadingLevel === 'village'}
            onChange={(e) => {
              const item = villages.find((v) => v.id === e.target.value);
              setField({ village_id: item?.id, village_name: item?.name });
            }}
            className={selectStyle}
          >
            <option value="">
              {loadingLevel === 'village'
                ? 'Memuat...'
                : !regionVal.district_id
                  ? '— Pilih kecamatan dulu —'
                  : '— Pilih Kelurahan/Desa —'}
            </option>
            {villages.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

function SignatureQuestion({ value, onChange, surveyId, invalid }: RendererProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState<boolean>(!!value);
  const [error, setError] = useState<string | null>(null);
  const uploadMedia = useMediaUpload();

  const point = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) * (c.width / rect.width),
      y: (e.clientY - rect.top) * (c.height / rect.height),
    };
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    drawing.current = true;
    const p = point(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext('2d');
    if (!ctx) return;
    const p = point(e);
    ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
  };
  const end = () => {
    drawing.current = false;
  };

  const clear = () => {
    const c = canvasRef.current;
    const ctx = c?.getContext('2d');
    if (c && ctx) ctx.clearRect(0, 0, c.width, c.height);
    setSaved(false);
    setError(null);
    onChange(null);
  };

  const save = async () => {
    const c = canvasRef.current;
    if (!c) return;
    setUploading(true);
    setError(null);
    try {
      const blob = await new Promise<Blob | null>((resolve) => c.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('Gagal membuat gambar tanda tangan.');
      const answerValue = await uploadMedia(
        new File([blob], 'signature.png', { type: 'image/png' }),
        surveyId,
        'signature.png',
      );
      onChange(answerValue);
      setSaved(true);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message || 'Gagal menyimpan tanda tangan.');
      onChange(null);
      setSaved(false);
    } finally {
      setUploading(false);
    }
  };

  if (saved) {
    return (
      <div className="flex items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
        <FileCheck2 className="h-5 w-5 text-emerald-600" />
        <span className="text-sm font-medium text-gray-800">Tanda tangan tersimpan</span>
        <button
          type="button"
          onClick={clear}
          className="ml-auto inline-flex items-center gap-1 text-sm text-red-500 hover:text-red-700"
        >
          <X className="h-3.5 w-3.5" /> Ulangi
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <canvas
        ref={canvasRef}
        width={520}
        height={180}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerLeave={end}
        className={`w-full touch-none rounded-lg border bg-white ${invalid ? 'border-red-300' : 'border-gray-300'}`}
        style={{ height: 180 }}
      />
      <p className="text-xs text-gray-400">
        Bubuhkan tanda tangan di kotak di atas (gunakan jari/mouse), lalu Simpan.
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={save}
          disabled={uploading}
          className="inline-flex items-center gap-2 rounded-lg bg-primary-600 px-4 py-2 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-50"
        >
          {uploading && <Loader2 className="h-4 w-4 animate-spin" />} Simpan Tanda Tangan
        </button>
        <button
          type="button"
          onClick={clear}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
        >
          Bersihkan
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

function PhotoQuestion({ value, onChange, surveyId, invalid }: RendererProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const uploadMedia = useMediaUpload();

  const handleFile = async (file: File) => {
    setError(null);
    setUploading(true);
    setPreview(URL.createObjectURL(file));
    try {
      const answerValue = await uploadMedia(file, surveyId, file.name);
      onChange(answerValue);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message || 'Gagal mengunggah foto.');
      onChange(null);
      setPreview(null);
    } finally {
      setUploading(false);
    }
  };

  const clear = () => {
    onChange(null);
    setPreview(null);
    setError(null);
  };

  return (
    <div className="space-y-2">
      {value ? (
        <div className="space-y-2">
          {preview ? (
            <img
              src={preview}
              alt="Foto"
              className="max-h-56 rounded-lg border border-gray-200 object-contain"
            />
          ) : (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-gray-800">
              <FileCheck2 className="h-5 w-5 text-emerald-600" /> Foto telah diunggah
            </div>
          )}
          <button
            type="button"
            onClick={clear}
            className="inline-flex items-center gap-1 text-sm text-red-500 hover:text-red-700"
          >
            <X className="h-3.5 w-3.5" /> Ambil ulang
          </button>
        </div>
      ) : (
        <label
          className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors hover:bg-gray-50 ${
            invalid ? 'border-red-300' : 'border-gray-300'
          }`}
        >
          {uploading ? (
            <span className="inline-flex items-center gap-2 text-sm text-gray-600">
              <Loader2 className="h-4 w-4 animate-spin" /> Mengunggah...
            </span>
          ) : (
            <>
              <Camera className="h-6 w-6 text-gray-400" />
              <span className="text-sm font-medium text-primary-700">Buka Kamera / Pilih Foto</span>
              <span className="text-xs text-gray-400">Di ponsel akan langsung membuka kamera</span>
            </>
          )}
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
          />
        </label>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

function GpsQuestion({ value, onChange, invalid }: RendererProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const coords =
    value && typeof value === 'object' && !Array.isArray(value)
      ? (value as { latitude?: number; longitude?: number; accuracy?: number })
      : null;
  const lat = typeof coords?.latitude === 'number' ? coords.latitude : null;
  const lng = typeof coords?.longitude === 'number' ? coords.longitude : null;
  const acc = typeof coords?.accuracy === 'number' ? coords.accuracy : null;

  const capture = () => {
    setLoading(true);
    setError(null);
    void getPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }).then((p) => {
      if (p) {
        onChange({ latitude: p.latitude, longitude: p.longitude, accuracy: p.accuracy ?? 0 });
      } else {
        setError('Gagal mengambil lokasi. Pastikan izin lokasi & GPS aktif.');
      }
      setLoading(false);
    });
  };

  return (
    <div className="space-y-2">
      {lat != null && lng != null ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm">
          <div className="flex items-center gap-2 font-medium text-emerald-700">
            <MapPin className="h-4 w-4" /> Lokasi terekam
          </div>
          <p className="mt-1 font-mono text-xs text-gray-600">
            {lat.toFixed(6)}, {lng.toFixed(6)}
            {acc != null ? ` (±${Math.round(acc)} m)` : ''}
          </p>
          <button
            type="button"
            onClick={capture}
            disabled={loading}
            className="mt-2 text-xs font-medium text-primary-600 hover:text-primary-800 disabled:opacity-50"
          >
            Rekam ulang
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={capture}
          disabled={loading}
          className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 ${
            invalid ? 'border-red-300' : 'border-gray-300'
          }`}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPin className="h-4 w-4" />}{' '}
          Rekam Lokasi Saat Ini
        </button>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

function pickAudioMimeType(): string {
  const candidates = ['audio/webm', 'audio/ogg', 'audio/mp4'];
  if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported) {
    for (const t of candidates) {
      if (MediaRecorder.isTypeSupported(t)) return t;
    }
  }
  return '';
}

function AudioQuestion({ value, onChange, surveyId, invalid }: RendererProps) {
  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const uploadMedia = useMediaUpload();

  const stopTracks = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  // Bersihkan stream/timer & URL preview saat unmount.
  useEffect(() => {
    return () => {
      stopTracks();
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const uploadBlob = async (blob: Blob, ext: string) => {
    setUploading(true);
    setError(null);
    try {
      const answerValue = await uploadMedia(blob, surveyId, `rekaman.${ext}`);
      onChange(answerValue);
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e.message || 'Gagal mengunggah rekaman.');
      onChange(null);
    } finally {
      setUploading(false);
    }
  };

  const start = async () => {
    setError(null);
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('Perangkat tidak mendukung perekaman audio.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickAudioMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const type = recorder.mimeType || mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type });
        const ext = type.includes('ogg') ? 'ogg' : type.includes('mp4') ? 'm4a' : 'webm';
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setPreviewUrl(URL.createObjectURL(blob));
        void uploadBlob(blob, ext);
        stopTracks();
      };
      recorder.start();
      recorderRef.current = recorder;
      setRecording(true);
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } catch {
      setError('Tidak bisa mengakses mikrofon. Izinkan akses mikrofon di browser.');
      stopTracks();
    }
  };

  const stop = () => {
    recorderRef.current?.stop();
    setRecording(false);
  };

  const clear = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    onChange(null);
    setError(null);
    setElapsed(0);
  };

  const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
  const secs = String(elapsed % 60).padStart(2, '0');

  return (
    <div className="space-y-2">
      {recording ? (
        <button
          type="button"
          onClick={stop}
          className="inline-flex items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
        >
          <Square className="h-4 w-4 fill-current" /> Stop ({mins}:{secs})
        </button>
      ) : value ? (
        <div className="space-y-2">
          <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-gray-800">
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-gray-500" /> Mengunggah rekaman...
              </>
            ) : (
              <>
                <FileCheck2 className="h-5 w-5 text-emerald-600" /> Rekaman tersimpan
              </>
            )}
          </div>
          {previewUrl && (
            <audio controls src={previewUrl} className="w-full">
              <track kind="captions" />
            </audio>
          )}
          <button
            type="button"
            onClick={clear}
            className="inline-flex items-center gap-1 text-sm text-red-500 hover:text-red-700"
          >
            <Trash2 className="h-3.5 w-3.5" /> Rekam ulang
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={start}
          disabled={uploading}
          className={`inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50 ${
            invalid ? 'border-red-300' : 'border-gray-300'
          }`}
        >
          {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mic className="h-4 w-4" />}{' '}
          Mulai Rekam
        </button>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}

export function QuestionRenderer(props: RendererProps) {
  const renderers: Record<Question['type'], React.FC<RendererProps>> = {
    single_choice: SingleChoiceQuestion,
    multiple_choice: MultipleChoiceQuestion,
    short_text: ShortTextQuestion,
    long_text: LongTextQuestion,
    phone_number: PhoneNumberQuestion,
    numeric_scale: NumericScaleQuestion,
    dropdown: DropdownQuestion,
    matrix_likert: MatrixLikertQuestion,
    file_upload: FileUploadQuestion,
    date_time: DateTimeQuestion,
    date: DateQuestion,
    rating_scale: RatingScaleQuestion,
    unique_id: UniqueIdQuestion,
    indonesia_region: IndonesiaRegionQuestion,
    signature: SignatureQuestion,
    photo: PhotoQuestion,
    gps: GpsQuestion,
    audio: AudioQuestion,
  };

  const Renderer = renderers[props.question.type];
  if (!Renderer) return <p className="text-sm text-red-500">Tipe pertanyaan tidak didukung</p>;
  return <Renderer {...props} />;
}

// ─── Chrome ───────────────────────────────────────────────────────────────────

function CountdownTimer({ minutes, onExpire }: { minutes: number; onExpire: () => void }) {
  const [secondsLeft, setSecondsLeft] = useState(minutes * 60);

  useEffect(() => {
    if (secondsLeft <= 0) {
      onExpire();
      return;
    }
    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          onExpire();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [secondsLeft, onExpire]);

  const mins = Math.floor(secondsLeft / 60);
  const secs = secondsLeft % 60;
  const warning = secondsLeft < 300;

  return (
    <div
      className={`fixed right-4 top-4 z-50 inline-flex items-center gap-2 rounded-lg px-3.5 py-2 font-mono text-sm font-semibold shadow-lg ${
        warning ? 'animate-pulse bg-red-600 text-white' : 'bg-gray-900 text-white'
      }`}
    >
      <Timer className="h-4 w-4" />
      {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
    </div>
  );
}

function ProgressBar({
  current,
  total,
  unit = 'Halaman',
}: {
  current: number;
  total: number;
  unit?: string;
}) {
  const percentage = Math.round((current / total) * 100);
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-sm">
        <span className="font-medium text-gray-700">
          {unit} {current} dari {total}
        </span>
        <span className="text-gray-500">{percentage}%</span>
      </div>
      <div className="h-2.5 w-full overflow-hidden rounded-full bg-gray-200">
        <div
          className="h-2.5 rounded-full bg-gradient-to-r from-primary-500 to-primary-600 transition-all duration-500 ease-out"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

/** Serialisasi kanonik (key terurut) agar perbandingan "berubah?" stabil. */
function serializeAnswers(o: Record<string, AnswerValue>): string {
  return JSON.stringify(
    Object.keys(o)
      .sort()
      .reduce<Record<string, AnswerValue>>((acc, k) => {
        acc[k] = o[k];
        return acc;
      }, {}),
  );
}

export function SurveyFillPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [survey, setSurvey] = useState<SurveyFillData | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [earnedPoints, setEarnedPoints] = useState<number>(0);
  const [error, setError] = useState<string | null>(null);
  const [missingIds, setMissingIds] = useState<Set<string>>(new Set());
  const [destinationNumber, setDestinationNumber] = useState('');
  const [rewardType, setRewardType] = useState('pulsa');
  const [queuedOffline, setQueuedOffline] = useState(false);
  const autoSaveTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSavedRef = useRef<string>('');
  /** Lokasi GPS saat form dibuka (best-effort), dikirim bersama jawaban. */
  const startGeoRef = useRef<{ lat: number; lng: number } | null>(null);
  const online = useOnlineStatus();
  const sync = useOfflineSync();
  /** True bila draft tersimpan berhasil dimuat (pengisian dilanjutkan). */
  const [resumedDraft, setResumedDraft] = useState(false);
  /** Salinan answers/submitted terbaru untuk dibaca di cleanup (unmount). */
  const answersRef = useRef(answers);
  const submittedRef = useRef(false);
  /** Snapshot kanonik jawaban awal (assignments + draft) → deteksi perubahan. */
  const baselineRef = useRef<string | null>(null);

  useEffect(() => {
    answersRef.current = answers;
  }, [answers]);
  useEffect(() => {
    submittedRef.current = submitted;
  }, [submitted]);

  // Upload media: online → endpoint responden; offline → simpan blob lokal,
  // kembalikan referensi local-media:// yang di-resolve saat sinkron.
  const uploadMedia = useCallback<UploadMediaFn>(async (file, sId, filename = 'upload') => {
    if (navigator.onLine) {
      const fd = new FormData();
      fd.append('file', file, filename);
      const r = await api.upload<{ key: string }>(`/surveys/${sId}/responses/upload`, fd);
      return r.key;
    }
    const mediaId = makeLocalId();
    await mediaPut({ id: mediaId, blob: file, filename });
    return `${LOCAL_MEDIA_PREFIX}${mediaId}`;
  }, []);

  useEffect(() => {
    const fetchSurvey = async () => {
      try {
        const result = await api.get<SurveyFillData>(`/surveys/${id}/fill`);
        setSurvey(result);
        void cachePut(`respondent-fill:${id}`, result);

        // Lanjutkan pengisian: muat draft tersimpan dari server (best-effort,
        // hanya online). Jawaban yang tersimpan diisikan kembali ke form, lalu
        // pra-isi assignments melengkapi yang belum ada.
        const seed: Record<string, AnswerValue> = { ...(result.assignments ?? {}) };
        try {
          const mine = await api.get<{
            status?: string;
            answers?: { questionId: string; value: AnswerValue }[];
          } | null>(`/surveys/${id}/responses/mine`);
          if (mine && mine.status !== 'complete' && mine.answers?.length) {
            for (const a of mine.answers) seed[a.questionId] = a.value;
            setAnswers((prev) => ({ ...seed, ...prev }));
            setResumedDraft(true);
          }
        } catch {
          /* tak ada draft / offline → mulai baru */
        }
        baselineRef.current = serializeAnswers(seed);
      } catch (err: unknown) {
        // Sudah pernah menyelesaikan survei ini (409) → pesan jelas, JANGAN
        // jatuh ke cache (yang akan keliru menampilkan form lagi).
        const e = err as { statusCode?: number; message?: string };
        if (e?.statusCode === 409) {
          setError(
            e.message ||
              'Anda sudah mengisi survei ini. Satu responden hanya boleh mengisi satu kali.',
          );
        } else if (e?.statusCode === 403) {
          // Gerbang (mis. data diri belum lengkap / tidak memenuhi target) —
          // tampilkan pesan, JANGAN jatuh ke cache.
          setError(e.message || 'Anda belum dapat mengisi survei ini.');
        } else {
          // Offline / gagal jaringan → coba muat dari cache.
          const cached = await cacheGet<SurveyFillData>(`respondent-fill:${id}`);
          if (cached) setSurvey(cached);
          else setError('Gagal memuat survei dan tidak ada salinan offline.');
        }
      } finally {
        setLoading(false);
      }
    };
    fetchSurvey();
  }, [id]);

  // Tanam nilai pra-isi dari server (penugasan acak / arm eksperimen) ke peta
  // jawaban. Jawaban yang sudah diisi responden TIDAK ditimpa (prev menang).
  useEffect(() => {
    const assignments = survey?.assignments;
    if (!assignments || Object.keys(assignments).length === 0) return;
    setAnswers((prev) => ({ ...assignments, ...prev }));
  }, [survey?.assignments]);

  // Rekam lokasi awal saat form dibuka — HANYA bila survei mengaktifkan
  // setelan "Rekam lokasi GPS" (alat pendukung). Tidak memblokir pengisian.
  useEffect(() => {
    if (!survey?.captureGps) return;
    void captureGeo().then((geo) => {
      if (geo) startGeoRef.current = geo;
    });
  }, [survey?.captureGps]);

  const answersToArray = useCallback(
    () => Object.entries(answers).map(([questionId, value]) => ({ questionId, value })),
    [answers],
  );

  // Auto-save every 30s
  useEffect(() => {
    if (!survey) return;
    autoSaveTimerRef.current = setInterval(() => {
      const snapshot = JSON.stringify(answers);
      if (snapshot !== lastSavedRef.current) {
        api
          .post(`/surveys/${survey.id}/responses/save-progress`, {
            answers: answersToArray(),
            deviceType: DEVICE_TYPE,
            ...(startGeoRef.current
              ? {
                  startLatitude: startGeoRef.current.lat,
                  startLongitude: startGeoRef.current.lng,
                }
              : {}),
          })
          .catch(() => {
            /* silent auto-save failure */
          });
        lastSavedRef.current = snapshot;
      }
    }, 30000);
    return () => {
      if (autoSaveTimerRef.current) clearInterval(autoSaveTimerRef.current);
    };
  }, [survey, answers, answersToArray]);

  const evaluateCondition = useCallback(
    (condition: SkipCondition): boolean => {
      const answer = answers[condition.questionId];
      // Selaras dengan backend (condition-evaluator): jawaban kosong → kondisi
      // tidak terpenuhi untuk SEMUA operator. Jawaban pilihan-ganda (array) dicek
      // dengan "termasuk", bukan digabung jadi string (yang membuat equals/contains
      // gagal pada multiple choice).
      if (answer === null || answer === undefined) return false;
      const cv = condition.value;
      const isArr = Array.isArray(answer);
      const arr = isArr ? (answer as string[]).map((v) => String(v)) : [];
      switch (condition.operator) {
        case 'equals':
          return isArr ? arr.includes(cv) : String(answer) === cv;
        case 'not_equals':
          return isArr ? !arr.includes(cv) : String(answer) !== cv;
        case 'contains':
          return isArr ? arr.includes(cv) : String(answer).includes(cv);
        case 'greater_than':
          return !isArr && Number(answer) > Number(cv);
        case 'less_than':
          return !isArr && Number(answer) < Number(cv);
        default:
          return false;
      }
    },
    [answers],
  );

  const isQuestionVisible = useCallback(
    (question: Question): boolean =>
      !question.visibilityConditions?.length ||
      question.visibilityConditions.every(evaluateCondition),
    [evaluateCondition],
  );

  const shouldSkipQuestion = useCallback(
    (question: Question): boolean =>
      !!question.skipConditions?.length && question.skipConditions.some(evaluateCondition),
    [evaluateCondition],
  );

  const isActive = useCallback(
    (q: Question) => isQuestionVisible(q) && !shouldSkipQuestion(q),
    [isQuestionVisible, shouldSkipQuestion],
  );

  const handleSubmit = useCallback(async () => {
    if (!survey) return;

    // Client-side required validation mirrors the server's checks.
    const missing = survey.questions
      .filter((q) => q.required && isActive(q) && !isAnswered(answers[q.id]))
      .map((q) => q.id);

    if (missing.length > 0) {
      setMissingIds(new Set(missing));
      if (survey.formMode === 'wizard') {
        // Lompat ke langkah (indeks pertanyaan aktif) yang memuat pertanyaan wajib pertama.
        const active = survey.questions.filter(isActive);
        const stepIdx = active.findIndex((q) => q.id === missing[0]);
        setCurrentPage(stepIdx >= 0 ? stepIdx + 1 : 1);
      } else {
        const firstPage = survey.questions.find((q) => q.id === missing[0])?.page ?? currentPage;
        setCurrentPage(firstPage);
      }
      setError(`Masih ada ${missing.length} pertanyaan wajib yang belum diisi.`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (survey.rewardMode === 'manual' && !destinationNumber) {
      setError('Mohon isi nomor tujuan reward.');
      return;
    }

    setError(null);
    setMissingIds(new Set());
    setSubmitting(true);
    try {
      // Rekam lokasi akhir (best-effort) saat submit — hanya bila diaktifkan.
      const endGeo = survey.captureGps ? await captureGeo() : null;
      const localId = makeLocalId();
      const payload = {
        answers: answersToArray(),
        deviceType: DEVICE_TYPE,
        clientSubmissionId: localId,
        ...(startGeoRef.current
          ? {
              startLatitude: startGeoRef.current.lat,
              startLongitude: startGeoRef.current.lng,
            }
          : {}),
        ...(endGeo ? { endLatitude: endGeo.lat, endLongitude: endGeo.lng } : {}),
        ...(survey.rewardMode === 'manual' && destinationNumber
          ? { destinationNumber, rewardType }
          : {}),
      };

      if (online) {
        const result = await api.post<{ pointsEarned?: number }>(
          `/surveys/${survey.id}/responses/submit`,
          payload,
        );
        setEarnedPoints(result?.pointsEarned ?? survey.rewardPoints ?? 0);
        setSubmitted(true);
      } else {
        // Offline: antrikan submit; media (local-media://) di-resolve saat sync.
        await queueAdd({
          localId,
          surveyId: survey.id,
          surveyTitle: survey.title,
          submitPath: `/surveys/${survey.id}/responses/submit`,
          uploadPath: `/surveys/${survey.id}/responses/upload`,
          payload,
          createdAt: Date.now(),
          attempts: 0,
        });
        await sync.refresh();
        setQueuedOffline(true);
        setSubmitted(true);
      }
    } catch (err: unknown) {
      const e = err as { message?: string; errors?: string[] };
      setError(e.errors?.[0] || e.message || 'Gagal mengirim jawaban. Silakan coba lagi.');
    } finally {
      setSubmitting(false);
    }
  }, [
    survey,
    answers,
    destinationNumber,
    rewardType,
    isActive,
    answersToArray,
    currentPage,
    online,
    sync,
  ]);

  const handleTimerExpire = useCallback(() => {
    void handleSubmit();
  }, [handleSubmit]);

  // Ada progres yang belum dikirim? (berubah dari snapshot awal & belum submit)
  const isDirty = useMemo(() => {
    if (submitted || baselineRef.current === null) return false;
    return serializeAnswers(answers) !== baselineRef.current;
  }, [answers, submitted]);

  // Simpan progres SEGERA (dipakai saat meninggalkan halaman) — pakai answersRef
  // agar selalu nilai terbaru. Best-effort, abaikan kegagalan.
  const flushSave = useCallback(async () => {
    if (!survey || submittedRef.current) return;
    try {
      await api.post(`/surveys/${survey.id}/responses/save-progress`, {
        answers: Object.entries(answersRef.current).map(([questionId, value]) => ({
          questionId,
          value,
        })),
        deviceType: DEVICE_TYPE,
        ...(startGeoRef.current
          ? {
              startLatitude: startGeoRef.current.lat,
              startLongitude: startGeoRef.current.lng,
            }
          : {}),
      });
    } catch {
      /* abaikan: auto-save berikutnya / antrean akan menyusul */
    }
  }, [survey]);

  // Kunci navigasi dalam-app (mis. ketuk Reward/Profil di bar bawah) saat ada
  // progres belum dikirim — tampilkan konfirmasi sebelum meninggalkan survei.
  const blocker = useBlocker(
    useCallback(
      ({
        currentLocation,
        nextLocation,
      }: {
        currentLocation: { pathname: string };
        nextLocation: { pathname: string };
      }) => isDirty && currentLocation.pathname !== nextLocation.pathname,
      [isDirty],
    ),
  );

  // Peringatan bawaan browser saat menutup/refresh tab dengan progres tersisa.
  useEffect(() => {
    if (!isDirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty]);

  // Jaring pengaman: saat komponen dilepas dengan progres tersisa, simpan sekali.
  useEffect(() => {
    return () => {
      if (
        baselineRef.current !== null &&
        !submittedRef.current &&
        serializeAnswers(answersRef.current) !== baselineRef.current
      ) {
        void flushSave();
      }
    };
  }, [flushSave]);

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl">
        <Card className="animate-pulse">
          <div className="mb-4 h-6 w-2/3 rounded bg-gray-200" />
          <div className="mb-2 h-4 w-full rounded bg-gray-200" />
          <div className="h-4 w-3/4 rounded bg-gray-200" />
        </Card>
      </div>
    );
  }

  if (error && !survey) {
    return (
      <div className="mx-auto max-w-3xl">
        <Card className="border-red-200 bg-red-50 text-red-700">{error}</Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="mx-auto max-w-2xl">
        <Card className="animate-fade-up p-8 text-center sm:p-10">
          <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 ring-1 ring-emerald-100">
            <CheckCircle2 className="h-9 w-9 text-emerald-600" strokeWidth={1.75} />
          </div>
          <h2 className="text-2xl font-bold text-gray-900">Terima kasih!</h2>
          {queuedOffline ? (
            <p className="mt-1.5 text-gray-600">
              Jawaban Anda tersimpan dan akan dikirim otomatis saat perangkat kembali online.
            </p>
          ) : (
            <p className="mt-1.5 text-gray-600">Jawaban Anda telah berhasil dikirim.</p>
          )}
          {queuedOffline && (
            <div className="mx-auto mt-5 inline-flex items-center gap-2 rounded-lg bg-amber-50 px-4 py-2.5 text-amber-700 ring-1 ring-amber-100">
              <CloudUpload className="h-4 w-4" /> Menunggu sinkronisasi
            </div>
          )}
          {!queuedOffline && earnedPoints > 0 && (
            <div className="mx-auto mt-5 inline-flex items-center gap-2 rounded-lg bg-primary-50 px-4 py-2.5 text-primary-700 ring-1 ring-primary-100">
              <Gift className="h-4 w-4" />
              <span className="font-semibold">+{earnedPoints} poin</span> ditambahkan ke saldo Anda
            </div>
          )}
          <div className="mt-7">
            <Button onClick={() => navigate('/surveys')} size="lg">
              Kembali ke Daftar Survei
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (!survey) return null;

  // Mode wizard: satu pertanyaan aktif per langkah; selain itu paginasi per halaman.
  const isWizard = survey.formMode === 'wizard';
  const activeQuestions = survey.questions.filter(isActive);
  const totalSteps = isWizard ? Math.max(activeQuestions.length, 1) : survey.totalPages;
  const pageQuestions = isWizard
    ? activeQuestions.slice(currentPage - 1, currentPage)
    : survey.questions.filter((q) => q.page === currentPage).filter(isActive);
  const isLastPage = currentPage >= totalSteps;

  const handleAnswerChange = (questionId: string, value: AnswerValue) => {
    // UPPERCASE jawaban teks bebas ditangani di tiap komponen input (lihat
    // prop `uppercase`) agar nilai yang TAMPIL ikut huruf besar saat diketik.
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    if (missingIds.has(questionId) && isAnswered(value)) {
      setMissingIds((prev) => {
        const next = new Set(prev);
        next.delete(questionId);
        return next;
      });
    }
  };

  const goToNextPage = () => {
    if (currentPage < totalSteps) {
      setCurrentPage((p) => p + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const goToPrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage((p) => p - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  return (
    <MediaUploadProvider value={uploadMedia}>
      <div className="mx-auto max-w-3xl space-y-5">
        {/* Konfirmasi saat akan meninggalkan survei dengan progres belum dikirim. */}
        {blocker.state === 'blocked' && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
            <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
              <h3 className="text-base font-semibold text-gray-900">
                Tinggalkan pengisian survei?
              </h3>
              <p className="mt-1.5 text-sm text-gray-600">
                Jawaban Anda <span className="font-medium">tersimpan otomatis</span> dan bisa
                dilanjutkan nanti. Anda yakin ingin keluar sekarang?
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => blocker.reset?.()}
                  className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50"
                >
                  Lanjut isi
                </button>
                <button
                  type="button"
                  onClick={() => {
                    void flushSave();
                    blocker.proceed?.();
                  }}
                  className="rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-700"
                >
                  Simpan & keluar
                </button>
              </div>
            </div>
          </div>
        )}

        {resumedDraft && (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700 ring-1 ring-emerald-100">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            Pengisian sebelumnya dilanjutkan — jawaban Anda tersimpan otomatis.
          </div>
        )}

        {survey.maxDuration && (
          <CountdownTimer minutes={survey.maxDuration} onExpire={handleTimerExpire} />
        )}

        {(!online || sync.queuedCount > 0) && (
          <div
            className={`flex flex-wrap items-center justify-between gap-2 rounded-lg p-3 text-sm ring-1 ${
              !online
                ? 'bg-amber-50 text-amber-800 ring-amber-100'
                : 'bg-primary-50 text-primary-700 ring-primary-100'
            }`}
          >
            <span className="inline-flex items-center gap-2">
              {!online ? (
                <>
                  <WifiOff className="h-4 w-4" /> Mode offline — jawaban disimpan & dikirim saat
                  online
                </>
              ) : (
                <>
                  <CloudUpload className="h-4 w-4" /> {sync.queuedCount} jawaban menunggu sinkron
                </>
              )}
            </span>
            {sync.queuedCount > 0 && (
              <button
                type="button"
                onClick={() => sync.syncNow()}
                disabled={!online || sync.syncing}
                className="inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-1 font-medium text-gray-700 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50 disabled:opacity-50"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${sync.syncing ? 'animate-spin' : ''}`} />
                {sync.syncing ? 'Menyinkron...' : 'Sinkron sekarang'}
              </button>
            )}
          </div>
        )}

        {/* Header — hero ber-tema (selaras identitas app) */}
        <div className="overflow-hidden rounded-xl bg-gradient-to-br from-primary-600 to-primary-700 p-5 text-white shadow-sm sm:p-6">
          <div className="flex items-start gap-3">
            <img
              src="/logo-populi-center.png"
              alt=""
              className="h-10 w-10 shrink-0 rounded-lg bg-white/15 p-1.5"
            />
            <div className="min-w-0">
              <h1 className="text-xl font-bold tracking-tight">{survey.title}</h1>
              {survey.description && (
                <p className="mt-1 text-sm text-primary-100">{survey.description}</p>
              )}
            </div>
          </div>

          {survey.rewardMode === 'manual' && survey.rewardDescription && (
            <div className="mt-4 flex items-start gap-2.5 rounded-lg bg-white/15 p-3 ring-1 ring-white/20">
              <Gift className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="text-sm">
                <span className="font-medium">Reward:</span> {survey.rewardDescription}
              </p>
            </div>
          )}
          {survey.rewardMode === 'auto_point' && survey.rewardPoints && (
            <div className="mt-4 flex items-start gap-2.5 rounded-lg bg-white/15 p-3 ring-1 ring-white/20">
              <Gift className="mt-0.5 h-4 w-4 shrink-0" />
              <p className="text-sm">
                <span className="font-medium">Reward:</span> {survey.rewardPoints} poin otomatis
                setelah selesai
              </p>
            </div>
          )}
        </div>

        {/* Progress menempel di bawah header (sticky) agar selalu terlihat saat scroll */}
        <div className="sticky top-16 z-10 rounded-xl border border-gray-200 bg-surface/95 px-4 py-2.5 shadow-sm backdrop-blur">
          <ProgressBar
            current={currentPage}
            total={totalSteps}
            unit={isWizard ? 'Pertanyaan' : 'Halaman'}
          />
        </div>

        {error && (
          <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Questions for the current page */}
        <div key={currentPage} className="animate-fade-up space-y-5">
          {pageQuestions.map((question, idx) => {
            const invalid = missingIds.has(question.id);
            return (
              <Card
                key={question.id}
                className={invalid ? 'border-red-300 ring-1 ring-red-200' : ''}
              >
                <div className="mb-4 flex items-start gap-3">
                  <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xs font-semibold text-primary-700">
                    {isWizard ? currentPage : idx + 1}
                  </span>
                  <div className="flex-1">
                    <p className="text-base font-semibold leading-snug text-gray-900">
                      {question.text}
                      {question.required && <span className="ml-1 text-red-500">*</span>}
                    </p>
                    {question.description && (
                      <p className="mt-1 text-xs text-gray-500">{question.description}</p>
                    )}
                  </div>
                </div>
                <QuestionRenderer
                  question={question}
                  value={answers[question.id] ?? null}
                  onChange={(val) => handleAnswerChange(question.id, val)}
                  surveyId={survey.id}
                  invalid={invalid}
                  uppercase={survey.uppercaseAnswers ?? false}
                />
              </Card>
            );
          })}
        </div>

        {/* Manual reward destination */}
        {isLastPage && survey.rewardMode === 'manual' && (
          <Card>
            <h3 className="text-sm font-semibold text-gray-900">
              Nomor Tujuan Reward <span className="text-red-500">*</span>
            </h3>
            <p className="mb-3 mt-0.5 text-xs text-gray-500">
              Pilih jenis reward dan masukkan nomor tujuan untuk menerima reward.
            </p>
            <div className="mb-3">
              <label className="mb-1 block text-xs font-medium text-gray-600">Jenis Reward</label>
              <select
                value={rewardType}
                onChange={(e) => setRewardType(e.target.value)}
                className={fieldClasses(false)}
              >
                <option value="pulsa">Pulsa</option>
                <option value="gopay">GoPay</option>
                <option value="ovo">OVO</option>
                <option value="dana">DANA</option>
                <option value="shopeepay">ShopeePay</option>
              </select>
            </div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Nomor Tujuan</label>
            <div className="flex items-center gap-2">
              <span className="rounded-lg border border-gray-300 bg-gray-100 px-3 py-2.5 text-sm text-gray-600">
                +62
              </span>
              <input
                type="tel"
                inputMode="numeric"
                value={destinationNumber}
                onChange={(e) => setDestinationNumber(e.target.value.replace(/[^0-9]/g, ''))}
                placeholder="8xxxxxxxxxx"
                className={`flex-1 ${fieldClasses(false)}`}
              />
            </div>
          </Card>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between gap-3 pb-2">
          <Button variant="secondary" onClick={goToPrevPage} disabled={currentPage === 1}>
            <ChevronLeft className="h-4 w-4" /> Sebelumnya
          </Button>

          {isLastPage ? (
            <Button onClick={handleSubmit} isLoading={submitting}>
              <Send className="h-4 w-4" /> {submitting ? 'Mengirim...' : 'Kirim Jawaban'}
            </Button>
          ) : (
            <Button onClick={goToNextPage}>
              Selanjutnya <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </MediaUploadProvider>
  );
}
