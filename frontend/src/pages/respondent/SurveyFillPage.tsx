import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate, useBlocker } from 'react-router-dom';
import { getPosition } from '@/utils/geo';
import {
  Timer,
  Check,
  Upload,
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
  WifiOff,
  CloudUpload,
  RefreshCw,
} from 'lucide-react';
import { api } from '@/services/api';
import { showAppNotice } from '@/stores/notification.store';
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
  makeLocalId,
  mediaPut,
  LOCAL_MEDIA_PREFIX,
} from '@/utils/offlineQueue';
import { Badge } from '@/components/common/Badge';
import { Button, useTapFeedback } from '@/components/common/Button';
import { CountUp } from '@/components/common/CountUp';
import { Notice } from '@/components/common/Notice';
import { QuestionSkeleton, Skeleton } from '@/components/common/Skeleton';
import type {
  AnswerValue,
  Question,
  RendererProps,
  SurveyFillData,
  SurveyOption,
} from '@/types/survey';
import { fieldClasses } from './questions/shared';
import { IndonesiaRegionQuestion } from './questions/IndonesiaRegionQuestion';
import { isActive as isActivePure } from '@/utils/surveyBranching';
import {
  autoScrollBehavior,
  captureGeo,
  isAnswered,
  serializeAnswers,
  computeResumePage,
} from './surveyFillHelpers';
import { useAutoSave } from './hooks/useAutoSave';
import { useSurveySubmission } from './hooks/useSurveySubmission';
import { celebrate } from '@/utils/celebrate';
import { haptic } from '@/utils/haptics';
import { isEmbedMode } from '@/utils/embed';
import { usePointsStore } from '@/stores/points.store';

// Tipe domain pengisian survei dipindah ke `@/types/survey` (dipakai bersama
// komponen renderer). Re-export agar impor lama yang menunjuk file ini (jika ada)
// tetap jalan.
export type { AnswerValue, Question } from '@/types/survey';

function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// ─── Question Renderers ───────────────────────────────────────────────────────

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

// Bingkai panel pertanyaan: lebar penuh di HP, berbingkai dari sm ke atas.
const panelFrame = '-mx-4 border-y bg-panel sm:mx-0 sm:rounded-xl sm:border';
const panelCls = (invalid = false) =>
  `${panelFrame} p-4 sm:p-6 ${invalid ? 'border-danger-fg' : 'border-gray-200'}`;

// Kolom isi strip progres dan nav bawah: sisi kirinya sejajar dengan panel
// pertanyaan (max-w-3xl) di semua lebar layar. 51rem = 48rem + padding sm:px-6.
const fillColumn = 'mx-auto max-w-[51rem] px-4 sm:px-6';

// Terpilih memakai border-2, jadi padding dikurangi 1px agar teks tidak bergeser.
const choiceRowClasses = (selected: boolean) =>
  `flex min-h-12 cursor-pointer items-center gap-3 rounded-lg transition-colors ${
    selected
      ? 'border-2 border-primary-600 bg-primary-50 px-[13px] py-[11px]'
      : 'border border-gray-300 bg-panel px-3.5 py-3 hover:bg-gray-50'
  }`;

/** Satu pola status "tersimpan" untuk media dan lokasi: centang + teks, tanpa pita. */
function SavedNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="flex min-w-0 items-center gap-2 text-sm font-medium text-gray-800">
      <Check className="h-4 w-4 shrink-0 text-success-fg" strokeWidth={1.75} aria-hidden="true" />
      <span className="min-w-0 break-words">{children}</span>
    </p>
  );
}

/** Pesan gagal unggah, rekam, atau ambil lokasi. */
function FieldError({ children }: { children: React.ReactNode }) {
  return (
    <p role="alert" className="flex items-start gap-1.5 text-sm text-danger-fg">
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={1.75} aria-hidden="true" />
      <span className="min-w-0">{children}</span>
    </p>
  );
}

/** Awalan kode negara di depan input nomor. */
function PhonePrefix() {
  return (
    <span className="inline-flex h-11 shrink-0 items-center rounded-lg border border-gray-300 bg-gray-50 px-3 text-sm tabular-nums text-gray-700 lg:h-10">
      +62
    </span>
  );
}

/**
 * Deret angka satu-ketuk untuk skala numerik dan rating angka. Aksi saat dipilih
 * tetap milik pemanggil: skala numerik bisa dibatalkan dengan ketuk ulang, rating
 * tidak. Lebar tiap angka sama agar tidak ada nilai yang tampak lebih menonjol.
 */
function ScalePicker({
  label,
  numbers,
  selected,
  onSelect,
  invalid,
}: {
  label: string;
  numbers: number[];
  selected: number | null;
  onSelect: (num: number) => void;
  invalid?: boolean;
}) {
  const tap = useTapFeedback();
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="grid grid-cols-[repeat(auto-fit,minmax(2.75rem,1fr))] gap-2"
    >
      {numbers.map((num) => {
        const active = selected === num;
        return (
          <button
            key={num}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={String(num)}
            onClick={(e) => {
              tap(e);
              onSelect(num);
            }}
            className={`h-11 rounded-lg text-base tabular-nums transition-colors ${
              active
                ? 'border-2 border-primary-600 bg-primary-50 font-semibold text-gray-900'
                : `border bg-panel font-medium text-gray-800 hover:bg-gray-50 ${
                    invalid ? 'border-danger-fg' : 'border-gray-300'
                  }`
            }`}
          >
            {num}
          </button>
        );
      })}
    </div>
  );
}

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
              className="h-5 w-5 shrink-0 accent-primary-600"
            />
            <span className="min-w-0 text-base text-gray-900">{opt.label}</span>
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
            className="h-5 w-5 shrink-0 accent-primary-600"
          />
          <span className="shrink-0 text-base text-gray-900">Lainnya:</span>
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
            className={`min-w-0 flex-1 ${fieldClasses()}`}
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
              className="h-5 w-5 shrink-0 rounded accent-primary-600"
            />
            <span className="min-w-0 text-base text-gray-900">{opt.label}</span>
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
            className="h-5 w-5 shrink-0 rounded accent-primary-600"
          />
          <span className="shrink-0 text-base text-gray-900">Lainnya:</span>
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
            className={`min-w-0 flex-1 ${fieldClasses()}`}
          />
        </label>
      )}
    </div>
  );
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
      className={`${fieldClasses(invalid, true)} resize-y`}
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
        <PhonePrefix />
        <input
          type="tel"
          inputMode="numeric"
          maxLength={PHONE_MAX_DIGITS}
          value={current}
          onChange={(e) =>
            onChange(e.target.value.replace(/[^0-9]/g, '').slice(0, PHONE_MAX_DIGITS))
          }
          placeholder="8xxxxxxxxxx"
          className={`min-w-0 flex-1 ${fieldClasses(invalid)}`}
          aria-label={question.text}
        />
      </div>
      <p className="mt-1 text-xs text-gray-600">
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
  const selected = (value as string) ?? '';

  // Rentang kecil (≤11 mis. 1-10) → deretan tombol satu-ketuk, ramah mobile &
  // aksesibel (radiogroup). Rentang besar → tetap dropdown agar tak meluber.
  if (count > 0 && count <= 11) {
    return (
      <div>
        <ScalePicker
          label={question.text}
          numbers={numbers}
          selected={selected === '' ? null : Number(selected)}
          onSelect={(num) => onChange(selected === String(num) ? null : String(num))}
          invalid={invalid}
        />
        <p className="mt-2 text-xs text-gray-600">
          Ketuk angka {min} sampai {max}.
        </p>
      </div>
    );
  }

  return (
    <div>
      <select
        value={selected}
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
      <p className="mt-1 text-xs text-gray-600">
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

function MatrixLikertQuestion({ question, value, onChange, invalid }: RendererProps) {
  const rows = question.matrixRows ?? [];
  const columns = question.matrixColumns ?? [];
  const answers = (value as Record<string, string>) ?? {};

  return (
    <>
      {/* Di bawah md: tiap baris jadi blok dengan opsi bertumpuk. Urutan opsi dan nilai
          yang dikirim sama dengan tabel. `name` harus berbeda dari tabel agar kedua
          grup radio tidak saling membatalkan. */}
      <div className="space-y-5 md:hidden">
        {rows.map((row) => (
          <fieldset key={row}>
            <legend
              className={`mb-2 text-base font-medium ${
                invalid && !answers[row] ? 'text-danger-fg' : 'text-gray-900'
              }`}
            >
              {row}
            </legend>
            <div className="space-y-2">
              {columns.map((col) => {
                const selected = answers[row] === col;
                return (
                  <label key={col} className={choiceRowClasses(selected)}>
                    <input
                      type="radio"
                      name={`${question.id}-${row}-stack`}
                      checked={selected}
                      onChange={() => onChange({ ...answers, [row]: col })}
                      className="h-5 w-5 shrink-0 accent-primary-600"
                    />
                    <span className="min-w-0 text-base text-gray-900">{col}</span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>

      {/* Dari md ke atas: tabel dengan kolom pertama menempel saat digeser. */}
      <div className="hidden overflow-x-auto rounded-lg border border-gray-200 md:block">
        <table className="min-w-full border-separate border-spacing-0">
          <thead>
            <tr>
              <th className="sticky left-0 z-[1] border-r border-gray-100 bg-panel px-4 py-2.5 text-left">
                <span className="sr-only">Pernyataan</span>
              </th>
              {columns.map((col) => (
                <th
                  key={col}
                  scope="col"
                  className="min-w-20 px-3 py-2.5 text-center text-xs font-medium text-gray-700"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row} className="group">
                <th
                  scope="row"
                  className={`sticky left-0 z-[1] min-w-44 max-w-72 border-r border-t border-gray-100 bg-panel px-4 py-3 text-left text-sm font-normal group-hover:bg-gray-50 ${
                    invalid && !answers[row] ? 'text-danger-fg' : 'text-gray-800'
                  }`}
                >
                  {row}
                </th>
                {columns.map((col) => (
                  <td
                    key={col}
                    className="border-t border-gray-100 p-0 text-center group-hover:bg-gray-50"
                  >
                    <label className="flex h-11 min-w-11 cursor-pointer items-center justify-center">
                      <input
                        type="radio"
                        name={`${question.id}-${row}`}
                        checked={answers[row] === col}
                        onChange={() => onChange({ ...answers, [row]: col })}
                        className="h-5 w-5 accent-primary-600"
                        aria-label={`${row} - ${col}`}
                      />
                    </label>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function FileUploadQuestion({ question, value, onChange, surveyId, invalid }: RendererProps) {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [fileName, setFileName] = useState<string>(value ? 'Berkas terunggah' : '');
  const [uploadError, setUploadError] = useState<string | null>(null);
  const uploadMedia = useMediaUpload();
  const inputRef = useRef<HTMLInputElement | null>(null);

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
      {/* Area seret hanya dari lg ke atas; di HP cukup tombol pilih berkas. */}
      <div
        className={`transition-colors lg:rounded-lg lg:border-2 lg:border-dashed lg:p-6 lg:text-center ${
          dragOver
            ? 'lg:border-primary-600 lg:bg-primary-50'
            : invalid
              ? 'lg:border-danger-fg'
              : 'lg:border-gray-300'
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
          <div className="flex items-center gap-2 text-sm text-gray-600 lg:justify-center">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Mengunggah...
          </div>
        ) : fileName ? (
          <div className="flex flex-wrap items-center justify-between gap-2 lg:justify-center">
            <SavedNote>{fileName}</SavedNote>
            <Button type="button" variant="ghost" onClick={clearFile}>
              <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" /> Hapus
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            <p className="hidden text-sm text-gray-600 lg:block">Seret berkas ke sini, atau</p>
            <Button
              type="button"
              variant="secondary"
              onClick={() => inputRef.current?.click()}
              className={invalid ? 'max-lg:border-danger-fg!' : ''}
            >
              <Upload className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" /> Pilih berkas
            </Button>
            <input
              ref={inputRef}
              type="file"
              className="hidden"
              accept="image/png,image/jpeg,image/gif,image/webp,application/pdf"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadFile(file);
              }}
              aria-label={question.text}
            />
            <p className="text-xs text-gray-600">PNG, JPG, GIF, WEBP, atau PDF · maks 5 MB</p>
          </div>
        )}
      </div>
      {uploadError && <FieldError>{uploadError}</FieldError>}
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
        <p className="text-xs text-gray-600">
          {min && max ? `${min}–${max} digit` : min ? `min ${min} digit` : `maks ${max} digit`}
        </p>
      )}
    </div>
  );
}

function RatingScaleQuestion({ question, value, onChange, invalid }: RendererProps) {
  const cfg = question.ratingConfig;
  const max = cfg?.ratingMax ?? 5;
  const mode = cfg?.ratingDisplayMode ?? 'star';
  const current = value ? Number(value) : 0;
  const tap = useTapFeedback();

  return (
    <div className="space-y-2">
      {mode === 'star' ? (
        <div role="radiogroup" aria-label={question.text} className="flex flex-wrap gap-0.5">
          {Array.from({ length: max }, (_, i) => i + 1).map((num) => (
            <button
              key={num}
              type="button"
              role="radio"
              aria-checked={num === current}
              onClick={(e) => {
                tap(e);
                onChange(String(num));
              }}
              className={`flex h-11 w-11 items-center justify-center rounded-lg transition-colors ${
                num <= current ? 'text-star' : invalid ? 'text-danger-fg' : 'text-gray-300'
              }`}
              aria-label={`${num} bintang`}
            >
              {/* Terpilih dibedakan oleh isi lawan garis, bukan warna saja. */}
              <Star
                className="h-8 w-8"
                strokeWidth={1.75}
                fill={num <= current ? 'currentColor' : 'none'}
                aria-hidden="true"
              />
            </button>
          ))}
        </div>
      ) : (
        <ScalePicker
          label={question.text}
          numbers={Array.from({ length: max }, (_, i) => i + 1)}
          selected={current}
          onSelect={(num) => onChange(String(num))}
          invalid={invalid}
        />
      )}
      {(cfg?.ratingMinLabel || cfg?.ratingMaxLabel) && (
        <div className="flex justify-between gap-4 text-xs text-gray-600">
          <span>{cfg?.ratingMinLabel ?? ''}</span>
          <span className="text-right">{cfg?.ratingMaxLabel ?? ''}</span>
        </div>
      )}
      {current > 0 && (
        <p className="text-sm text-gray-600">
          Anda memilih: <span className="font-medium tabular-nums text-gray-900">{current}</span>
          {mode === 'star' && ' bintang'}
        </p>
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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <SavedNote>Tanda tangan tersimpan</SavedNote>
        <Button type="button" variant="ghost" onClick={clear}>
          <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" /> Ulangi
        </Button>
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
        className={`w-full touch-none rounded-lg border bg-paper ${invalid ? 'border-danger-fg' : 'border-gray-300'}`}
        style={{ height: 180 }}
      />
      <p className="text-xs text-gray-600">
        Bubuhkan tanda tangan di kotak di atas (gunakan jari/mouse), lalu Simpan.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" onClick={save} isLoading={uploading}>
          Simpan tanda tangan
        </Button>
        <Button type="button" variant="secondary" onClick={clear}>
          Bersihkan
        </Button>
      </div>
      {error && <FieldError>{error}</FieldError>}
    </div>
  );
}

function PhotoQuestion({ value, onChange, surveyId, invalid }: RendererProps) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const uploadMedia = useMediaUpload();
  const inputRef = useRef<HTMLInputElement | null>(null);

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
            // bg-paper: PNG transparan bertinta gelap tetap terlihat di tema gelap.
            <img
              src={preview}
              alt="Foto"
              className="max-h-56 rounded-lg border border-gray-200 bg-paper object-contain"
            />
          ) : (
            <SavedNote>Foto telah diunggah</SavedNote>
          )}
          <Button type="button" variant="ghost" onClick={clear}>
            <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" /> Ambil ulang
          </Button>
        </div>
      ) : (
        <>
          <Button
            type="button"
            variant="secondary"
            isLoading={uploading}
            onClick={() => inputRef.current?.click()}
            className={invalid ? 'border-danger-fg!' : ''}
          >
            {uploading ? (
              'Mengunggah...'
            ) : (
              <>
                <Camera className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" /> Buka kamera /
                pilih foto
              </>
            )}
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
            }}
          />
        </>
      )}
      {error && <FieldError>{error}</FieldError>}
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
        <div className="space-y-1">
          <SavedNote>Lokasi terekam</SavedNote>
          <p className="text-xs tabular-nums text-gray-600">
            {lat.toFixed(6)}, {lng.toFixed(6)}
            {acc != null ? ` (±${Math.round(acc)} m)` : ''}
          </p>
          <Button type="button" variant="ghost" onClick={capture} isLoading={loading}>
            Rekam ulang
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="secondary"
          onClick={capture}
          isLoading={loading}
          className={invalid ? 'border-danger-fg!' : ''}
        >
          {!loading && <MapPin className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />}
          Rekam lokasi saat ini
        </Button>
      )}
      {error && <FieldError>{error}</FieldError>}
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
        // Merah di sini menandakan mikrofon sedang aktif.
        <Button type="button" variant="danger" onClick={stop}>
          <Square className="h-4 w-4 fill-current" aria-hidden="true" />
          <span className="tabular-nums">
            Stop ({mins}:{secs})
          </span>
        </Button>
      ) : value ? (
        <div className="space-y-2">
          {uploading ? (
            <p className="flex items-center gap-2 text-sm text-gray-600">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Mengunggah rekaman...
            </p>
          ) : (
            <SavedNote>Rekaman tersimpan</SavedNote>
          )}
          {previewUrl && (
            <audio controls src={previewUrl} className="w-full">
              <track kind="captions" />
            </audio>
          )}
          <Button type="button" variant="ghost" onClick={clear}>
            <RefreshCw className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" /> Rekam ulang
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          variant="secondary"
          onClick={start}
          isLoading={uploading}
          className={invalid ? 'border-danger-fg!' : ''}
        >
          {!uploading && <Mic className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />}
          Mulai rekam
        </Button>
      )}
      {error && <FieldError>{error}</FieldError>}
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
  if (!Renderer) return <p className="text-sm text-danger-fg">Tipe pertanyaan tidak didukung</p>;
  return <Renderer {...props} />;
}

// ─── Chrome ───────────────────────────────────────────────────────────────────

function CountdownTimer({ minutes, onExpire }: { minutes: number; onExpire: () => void }) {
  const [secondsLeft, setSecondsLeft] = useState(minutes * 60);
  const warnedRef = useRef(false);

  // Peringatan sekali saat sisa ≤60 detik — agar responden tak kaget jawaban
  // terkirim mendadak oleh timer.
  useEffect(() => {
    if (!warnedRef.current && secondsLeft > 0 && secondsLeft <= 60) {
      warnedRef.current = true;
      showAppNotice({
        title: 'Waktu hampir habis',
        body: 'Sisa waktu 1 menit — jawaban akan otomatis terkirim saat waktu habis.',
        tone: 'warning',
      });
    }
  }, [secondsLeft]);

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
  // Merah hanya pada 60 detik terakhir (selaras toast di atas), tanpa kedip.
  const urgent = secondsLeft <= 60;

  return (
    <span
      role="timer"
      aria-label={`Sisa waktu ${mins} menit ${secs} detik`}
      className={`inline-flex shrink-0 items-center gap-1 font-medium tabular-nums ${
        urgent ? 'text-danger-fg' : 'text-gray-700'
      }`}
    >
      <Timer className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
      {String(mins).padStart(2, '0')}:{String(secs).padStart(2, '0')}
    </span>
  );
}

/**
 * Strip progres: menempel tepat di bawah header (top-0 di mode embed karena header
 * disembunyikan). Sisi kanan (`children`) untuk status simpan dan timer. z-index-nya
 * di bawah header (z-10) agar tidak menimpa panel lonceng yang terkurung di konteks
 * tumpukan header, tetapi di atas kolom sticky matriks (z-[1]).
 */
function ProgressStrip({
  current,
  total,
  unit = 'Halaman',
  children,
}: {
  current: number;
  total: number;
  unit?: string;
  children?: React.ReactNode;
}) {
  const percentage = Math.round((current / total) * 100);
  return (
    <div
      className={`sticky z-[5] -mx-4 border-b border-gray-200 bg-panel sm:-mx-6 lg:-mx-8 ${
        isEmbedMode ? 'top-0' : 'top-16'
      }`}
    >
      <div
        className={`${fillColumn} flex items-center justify-between gap-3 py-2 text-xs tabular-nums text-gray-600`}
      >
        <span className="min-w-0 truncate">
          {unit} {current} dari {total}
        </span>
        <span className="flex shrink-0 items-center gap-3">{children}</span>
      </div>
      <div
        role="progressbar"
        aria-label="Kemajuan pengisian"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percentage}
        className="h-1 overflow-hidden bg-gray-200"
      >
        <div
          className="h-full bg-accent-600 transition-[width] duration-[320ms] ease-out motion-reduce:transition-none"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

const BALANCE_RETRY_MS = [400, 1000, 2000, 3000];

/**
 * Saldo untuk tanda terima layar selesai (hanya membaca). Poin dikredit server secara
 * asinkron setelah submit, jadi saldo baru dianggap benar bila sudah bertambah minimal
 * sebesar poin yang diperoleh. Bila tidak terkonfirmasi, hasilnya null dan barisnya
 * disembunyikan, supaya layar tidak menyebut angka lama sebagai "saldo sekarang".
 */
function useBalanceAfterCredit(earned: number, enabled: boolean): number | 'loading' | null {
  const [balance, setBalance] = useState<number | 'loading' | null>('loading');

  useEffect(() => {
    if (!enabled) return;
    const { available: before, setAvailable } = usePointsStore.getState();
    if (before === null) {
      setBalance(null);
      return;
    }
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    const attempt = (i: number) => {
      timer = setTimeout(() => {
        api
          .get<{ available: number }>('/rewards/balance')
          .then((b) => {
            if (cancelled) return;
            const now = b?.available ?? 0;
            setAvailable(now);
            if (now >= before + earned) setBalance(now);
            else if (i + 1 < BALANCE_RETRY_MS.length) attempt(i + 1);
            else setBalance(null);
          })
          .catch(() => {
            if (!cancelled) setBalance(null);
          });
      }, BALANCE_RETRY_MS[i]);
    };
    attempt(0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [enabled, earned]);

  return enabled ? balance : null;
}

// Satu-satunya kegagalan muat yang benar-benar error. Pesan 409 dan 403 dari server
// bukan error (sudah mengisi, belum memenuhi syarat), jadi tampil netral.
const LOAD_FAILED_MESSAGE = 'Gagal memuat survei dan tidak ada salinan offline.';

// ─── Main ─────────────────────────────────────────────────────────────────────

/** Serialisasi kanonik (key terurut) agar perbandingan "berubah?" stabil. */
export function SurveyFillPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [survey, setSurvey] = useState<SurveyFillData | null>(null);
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [missingIds, setMissingIds] = useState<Set<string>>(new Set());
  const [destinationNumber, setDestinationNumber] = useState('');
  const [rewardType, setRewardType] = useState('pulsa');
  /** Lokasi GPS saat form dibuka (best-effort), dikirim bersama jawaban. */
  const startGeoRef = useRef<{ lat: number; lng: number } | null>(null);
  /** Waktu form dibuka (ISO) — dikirim saat submit agar server bisa menegakkan
   *  anti-bot & batas waktu pada jalur tanpa sesi (offline→sync / kirim langsung). */
  const startedAtRef = useRef<string>(new Date().toISOString());
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
            setResumedDraft(true);
            // Lanjut di posisi terakhir (checkpoint): langkah/halaman pertanyaan
            // aktif pertama yang belum diisi — bukan mulai dari awal lagi.
            setCurrentPage(computeResumePage(result, seed));
          }
        } catch {
          /* tak ada draft / offline → mulai baru */
        }
        // Seed jawaban (arm/assignments + draft) SEGERA di sini — baik ada draft
        // maupun tidak — agar isActive (cabang berbasis arm) langsung benar tanpa
        // menunggu efek terpisah render berikutnya (cegah race saat submit cepat/
        // auto-submit timer di mana arm belum ter-seed).
        setAnswers((prev) => ({ ...seed, ...prev }));
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
          else setError(LOAD_FAILED_MESSAGE);
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

  // Auto-simpan draft (berkala 30s + flush saat keluar) — lihat useAutoSave.
  const { flushSave, lastSavedAt } = useAutoSave({
    survey,
    answers,
    answersRef,
    submittedRef,
    startGeoRef,
  });

  // Logika percabangan dipindah ke util murni (@/utils/surveyBranching) yang
  // bisa diuji unit; wrapper di sini hanya mengikat `answers` + memoisasi.
  const isActive = useCallback((q: Question) => isActivePure(q, answers), [answers]);

  // Alur submit final (jalur poin) diekstrak ke useSurveySubmission — lihat hook.
  const {
    submit: handleSubmit,
    submitting,
    submitted,
    earnedPoints,
    queuedOffline,
  } = useSurveySubmission({
    survey,
    answers,
    answersToArray,
    isActive,
    currentPage,
    destinationNumber,
    rewardType,
    online,
    sync,
    startGeoRef,
    startedAtRef,
    setError,
    setMissingIds,
    setCurrentPage,
  });

  // Sinkron submittedRef (dibaca useAutoSave.flushSave & cleanup unmount).
  useEffect(() => {
    submittedRef.current = submitted;
  }, [submitted]);

  // Perayaan saat jawaban BENAR-BENAR terkirim (bukan sekadar antre offline):
  // konfeti + getar sukses. Sekali saat transisi ke submitted.
  useEffect(() => {
    if (submitted && !queuedOffline) {
      celebrate();
      void haptic('success');
    }
  }, [submitted, queuedOffline]);

  // Pengisian yang dilanjutkan cukup diberitahukan sekali, bukan pita yang menetap.
  useEffect(() => {
    if (resumedDraft) {
      showAppNotice({
        title: 'Pengisian sebelumnya dilanjutkan',
        body: 'Jawaban Anda tersimpan otomatis.',
        tone: 'info',
      });
    }
  }, [resumedDraft]);

  const balanceAfter = useBalanceAfterCredit(
    earnedPoints,
    submitted && !queuedOffline && earnedPoints > 0 && !isEmbedMode,
  );

  const handleTimerExpire = useCallback(() => {
    void handleSubmit();
  }, [handleSubmit]);

  // Ada progres yang belum dikirim? (berubah dari snapshot awal & belum submit)
  const isDirty = useMemo(() => {
    if (submitted || baselineRef.current === null) return false;
    return serializeAnswers(answers) !== baselineRef.current;
  }, [answers, submitted]);

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
      <div role="status" aria-busy="true">
        <span className="sr-only">Memuat survei</span>
        <div className="-mx-4 border-b border-gray-200 bg-panel sm:-mx-6 lg:-mx-8">
          <div className={`${fillColumn} py-2`}>
            <Skeleton className="h-[18px] w-32" />
          </div>
          <div className="h-1 bg-gray-200" />
        </div>
        <div className="mx-auto max-w-3xl space-y-4 py-5 sm:space-y-5 sm:py-6">
          <div className="space-y-2">
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
          <div className={`${panelFrame} border-gray-200`}>
            <QuestionSkeleton />
          </div>
        </div>
      </div>
    );
  }

  if (error && !survey) {
    const loadFailed = error === LOAD_FAILED_MESSAGE;
    return (
      <div className="mx-auto max-w-3xl py-5 sm:py-6">
        <div className={panelCls()}>
          {loadFailed ? (
            <Notice tone="danger" role="alert">
              {error}
            </Notice>
          ) : (
            <p className="text-base text-gray-800">{error}</p>
          )}
          <div className="mt-4 flex flex-wrap gap-2">
            {loadFailed && (
              <Button type="button" onClick={() => window.location.reload()}>
                Coba lagi
              </Button>
            )}
            <Button
              type="button"
              variant={loadFailed ? 'secondary' : 'primary'}
              onClick={() => navigate('/surveys')}
            >
              Kembali ke daftar survei
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="mx-auto max-w-3xl py-5 sm:py-6">
        <div className={`${panelCls()} animate-fade-up`}>
          <h1 className="font-serif text-3xl text-gray-900">Terima kasih.</h1>
          {queuedOffline ? (
            <>
              <p className="mt-2 text-base text-gray-600">
                Jawaban Anda akan dikirim otomatis saat perangkat kembali online.
              </p>
              <div className="mt-4">
                <Badge tone="warning" icon={CloudUpload}>
                  Menunggu sinkronisasi
                </Badge>
              </div>
            </>
          ) : (
            <p className="mt-2 text-base text-gray-600">Jawaban Anda sudah tercatat.</p>
          )}
          {!queuedOffline && earnedPoints > 0 && (
            <dl className="mt-6 border-t-2 border-table-rule">
              <div className="flex items-baseline justify-between gap-4 py-3">
                <dt className="text-sm text-gray-600">Poin diperoleh</dt>
                <dd>
                  <CountUp
                    value={earnedPoints}
                    from={0}
                    format={(n) => `+${n.toLocaleString('id-ID')}`}
                    className="text-3xl font-semibold text-gray-900"
                  />
                </dd>
              </div>
              {balanceAfter !== null && (
                <div className="flex items-center justify-between gap-4 border-t border-gray-200 py-3">
                  <dt className="text-sm text-gray-600">Saldo sekarang</dt>
                  <dd className="text-sm font-medium tabular-nums text-gray-800">
                    {balanceAfter === 'loading' ? (
                      <Skeleton className="h-5 w-20" />
                    ) : (
                      `${balanceAfter.toLocaleString('id-ID')} poin`
                    )}
                  </dd>
                </div>
              )}
            </dl>
          )}
          <Button
            type="button"
            size="lg"
            onClick={() => navigate('/surveys')}
            className="mt-6 w-full sm:w-auto"
          >
            Kembali ke daftar survei
          </Button>
        </div>
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

  // Mode WIZARD: tombol "Selanjutnya" terkunci selama pertanyaan WAJIB di
  // langkah ini belum diisi (satu pertanyaan per langkah). Mode lain tak dikunci
  // di sini — validasi wajib penuh tetap dijalankan saat "Kirim".
  const nextBlockedByRequired =
    isWizard && pageQuestions.some((q) => q.required && !isAnswered(answers[q.id]));

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
    if (nextBlockedByRequired) return; // wizard: wajib diisi dulu
    if (currentPage < totalSteps) {
      setCurrentPage((p) => p + 1);
      window.scrollTo({ top: 0, behavior: autoScrollBehavior() });
    }
  };

  const goToPrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage((p) => p - 1);
      window.scrollTo({ top: 0, behavior: autoScrollBehavior() });
    }
  };

  // Nomor berjalan mode halaman: pertanyaan terlihat di halaman sebelumnya + posisi di
  // halaman ini, supaya kode P tidak kembali ke 1 di tiap halaman.
  const visibleBeforePage = activeQuestions.filter((q) => q.page < currentPage).length;

  // Meta halaman pertama. Hadiah sengaja tidak disebut: halaman ini memuat pertanyaan
  // pertama, dan nilainya sudah terlihat di daftar survei sebelum responden masuk.
  const surveyMeta = [
    `${activeQuestions.length} pertanyaan`,
    survey.maxDuration ? `± ${survey.maxDuration} menit` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  // Tombol Lanjut terkunci saat wajib kosong, jadi petunjuknya baru merah setelah
  // ada percobaan kirim yang menandai pertanyaan di langkah ini.
  const requiredHintFailed = pageQuestions.some((q) => missingIds.has(q.id));

  return (
    <MediaUploadProvider value={uploadMedia}>
      {/* Tinggi minimum agar nav bawah tetap di dasar layar saat pertanyaannya pendek.
          Dikurangi header (4rem + border 1px) dan pb-8 milik main (2rem), yang ditempati
          nav lewat -mb-8; tanpa itu halaman pendek bisa digulir sekitar 33px. */}
      <div className={`flex flex-col ${isEmbedMode ? '' : 'min-h-[calc(100dvh-6rem-1px)]'}`}>
        {/* Konfirmasi saat akan meninggalkan survei dengan progres belum dikirim. */}
        {blocker.state === 'blocked' && (
          <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="leave-survey-title"
              className="w-full max-w-sm rounded-xl bg-panel p-5 text-left shadow-xl"
            >
              <h3 id="leave-survey-title" className="text-lg font-semibold text-gray-900">
                Tinggalkan pengisian survei?
              </h3>
              <p className="mt-2 text-sm text-gray-600">
                Jawaban Anda <span className="font-medium">tersimpan otomatis</span> dan bisa
                dilanjutkan nanti. Anda yakin ingin keluar sekarang?
              </p>
              <div className="mt-5 flex justify-end gap-2">
                <Button type="button" variant="secondary" onClick={() => blocker.reset?.()}>
                  Lanjut isi
                </Button>
                <Button
                  type="button"
                  onClick={() => {
                    void flushSave();
                    blocker.proceed?.();
                  }}
                >
                  Simpan & keluar
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Strip progres menempel di bawah header agar selalu terlihat saat scroll. */}
        <ProgressStrip
          current={currentPage}
          total={totalSteps}
          unit={isWizard ? 'Pertanyaan' : 'Halaman'}
        >
          {/* Lebar tetap: munculnya waktu simpan tidak menggeser timer. */}
          <span className="w-[6.5rem] truncate text-right text-gray-500">
            {lastSavedAt &&
              `Tersimpan ${lastSavedAt.toLocaleTimeString('id-ID', {
                hour: '2-digit',
                minute: '2-digit',
              })}`}
          </span>
          {!!survey.maxDuration && (
            <CountdownTimer minutes={survey.maxDuration} onExpire={handleTimerExpire} />
          )}
        </ProgressStrip>

        <div className="mx-auto w-full max-w-3xl flex-1 space-y-4 py-5 sm:space-y-5 sm:py-6">
          {(!online || sync.queuedCount > 0) && (
            <Notice
              tone={!online ? 'warning' : 'neutral'}
              icon={!online ? WifiOff : CloudUpload}
              action={
                sync.queuedCount > 0 ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => sync.syncNow()}
                    disabled={!online || sync.syncing}
                  >
                    <RefreshCw
                      className={`h-4 w-4 ${sync.syncing ? 'animate-spin' : ''}`}
                      strokeWidth={1.75}
                      aria-hidden="true"
                    />
                    {sync.syncing ? 'Menyinkron...' : 'Sinkron sekarang'}
                  </Button>
                ) : undefined
              }
            >
              {!online
                ? 'Mode offline. Jawaban disimpan dan dikirim saat online.'
                : `${sync.queuedCount} jawaban menunggu sinkron`}
            </Notice>
          )}

          {/* Judul lengkap hanya di halaman pertama; berikutnya langsung ke pertanyaan. */}
          {currentPage === 1 ? (
            <div>
              <h1 className="text-2xl text-gray-900">{survey.title}</h1>
              {survey.description && (
                <p className="mt-2 text-base text-gray-700">{survey.description}</p>
              )}
              <p className="mt-2 text-xs tabular-nums text-gray-600">{surveyMeta}</p>
            </div>
          ) : (
            <h1 className="sr-only">{survey.title}</h1>
          )}

          {error && (
            <Notice tone="danger" role="alert" aria-live="assertive">
              {error}
            </Notice>
          )}

          {/* Questions for the current page */}
          <div key={currentPage} className="animate-fade-up space-y-3 sm:space-y-5">
            {pageQuestions.map((question, idx) => {
              const invalid = missingIds.has(question.id);
              return (
                // id + scroll-mt: jangkar agar submit gagal bisa scroll ke pertanyaan wajib kosong.
                <div
                  key={question.id}
                  id={`q-${question.id}`}
                  className={`scroll-mt-28 ${panelCls(invalid)}`}
                >
                  <div className="mb-4">
                    {/* Mode wizard tanpa kode: strip progres sudah menyebut nomornya. */}
                    {!isWizard && (
                      <p className="mb-1 text-xs tabular-nums text-gray-500">
                        P{visibleBeforePage + idx + 1}
                      </p>
                    )}
                    <p className="text-question font-medium text-gray-900">
                      {question.text}
                      {question.required && (
                        <>
                          <span className="ml-1 text-danger-fg" aria-hidden="true">
                            *
                          </span>
                          <span className="sr-only"> (wajib)</span>
                        </>
                      )}
                    </p>
                    {question.description && (
                      <p className="mt-1 text-sm text-gray-600">{question.description}</p>
                    )}
                  </div>
                  <QuestionRenderer
                    question={question}
                    value={answers[question.id] ?? null}
                    onChange={(val) => handleAnswerChange(question.id, val)}
                    surveyId={survey.id}
                    invalid={invalid}
                    uppercase={survey.uppercaseAnswers ?? false}
                  />
                  {invalid && (
                    <p className="mt-2 text-sm font-medium text-danger-fg">
                      Pertanyaan ini wajib diisi.
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Manual reward destination */}
          {isLastPage && survey.rewardMode === 'manual' && (
            <div className={panelCls()}>
              <h2 className="text-base font-semibold text-gray-900">
                Nomor tujuan reward <span className="text-danger-fg">*</span>
              </h2>
              <p className="mb-3 mt-1 text-sm text-gray-600">
                Pilih jenis reward dan masukkan nomor tujuan untuk menerima reward.
              </p>
              <div className="mb-3">
                <label
                  htmlFor="reward-type"
                  className="mb-1 block text-sm font-medium text-gray-700"
                >
                  Jenis reward
                </label>
                <select
                  id="reward-type"
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
              <label
                htmlFor="reward-destination"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                Nomor tujuan
              </label>
              <div className="flex items-center gap-2">
                <PhonePrefix />
                <input
                  id="reward-destination"
                  type="tel"
                  inputMode="numeric"
                  value={destinationNumber}
                  onChange={(e) => setDestinationNumber(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="8xxxxxxxxxx"
                  className={`min-w-0 flex-1 ${fieldClasses(false)}`}
                />
              </div>
            </div>
          )}
        </div>

        {/* Navigation — menempel di bawah layar (sticky) agar mudah dijangkau tanpa
            scroll jauh pada survei panjang. -mb-8 menutup jarak bawah milik layout. */}
        <div
          className="sticky bottom-0 z-20 -mx-4 -mb-8 border-t border-gray-200 bg-panel sm:-mx-6 lg:-mx-8"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          <div className={`${fillColumn} pt-3`}>
            <div className="flex items-center justify-between gap-3">
              <Button
                type="button"
                variant="secondary"
                size="lg"
                onClick={goToPrevPage}
                disabled={currentPage === 1}
              >
                <ChevronLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" /> Kembali
              </Button>

              {isLastPage ? (
                <Button type="button" size="lg" onClick={handleSubmit} isLoading={submitting}>
                  {!submitting && (
                    <Send className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  )}
                  {submitting ? 'Mengirim...' : 'Kirim jawaban'}
                </Button>
              ) : (
                <Button
                  type="button"
                  size="lg"
                  onClick={goToNextPage}
                  disabled={nextBlockedByRequired}
                  title={nextBlockedByRequired ? 'Jawab pertanyaan wajib ini dulu' : undefined}
                >
                  Lanjut <ChevronRight className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                </Button>
              )}
            </div>
            {nextBlockedByRequired && (
              <p
                className={`mt-1.5 text-right text-sm ${
                  requiredHintFailed ? 'text-danger-fg' : 'text-gray-600'
                }`}
              >
                Pertanyaan ini wajib diisi untuk melanjutkan.
              </p>
            )}
          </div>
        </div>
      </div>
    </MediaUploadProvider>
  );
}
