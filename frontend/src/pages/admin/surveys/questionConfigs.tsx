import { CircleHelp, Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { IconButton } from '@/components/common/IconButton';
import { Notice } from '@/components/common/Notice';
import { fieldCls } from '@/components/common/fieldStyles';
import type { Question, QuestionOption, ValidationRules } from './surveyEditTypes';

/**
 * Komponen KONFIGURASI per tipe pertanyaan untuk editor survei (dipakai oleh
 * SortableQuestionCard). Semua terkontrol: menerima {question, onEdit}.
 */

export function InfoHint({ text }: { text: string }) {
  return (
    <span
      role="img"
      title={text}
      aria-label={text}
      className="ml-1 inline-flex cursor-help align-middle text-gray-500"
    >
      <CircleHelp className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
    </span>
  );
}

// ─── Komponen konfigurasi per tipe ───────────────────────────────────────────

export function ChoiceConfig({
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
          <span className="w-5 shrink-0 text-xs text-gray-500 tabular-nums">{idx + 1}.</span>
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
            className={`${fieldCls} min-w-0 flex-1`}
            placeholder={`Opsi ${idx + 1}`}
          />
          <IconButton
            aria-label="Hapus opsi"
            destructive
            onClick={() => onEdit({ ...question, options: options.filter((_, i) => i !== idx) })}
          >
            <Trash2 className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </IconButton>
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          const newOpt: QuestionOption = {
            id: `opt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            label: '',
            value: `option_${options.length + 1}`,
            order: options.length,
          };
          onEdit({ ...question, options: [...options, newOpt] });
        }}
      >
        <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" /> Tambah Opsi
      </Button>
      <div className="mt-2 border-t border-gray-100 pt-2">
        <label className="flex min-h-11 items-center gap-2 text-sm text-gray-700 lg:min-h-0">
          <input
            type="checkbox"
            checked={question.hasOtherOption ?? false}
            onChange={(e) => onEdit({ ...question, hasOtherOption: e.target.checked })}
            className="h-4 w-4 shrink-0 accent-primary-600"
          />
          Tambah opsi "Lainnya" (teks bebas)
        </label>
      </div>
      <label className="flex min-h-11 items-center gap-2 text-sm text-gray-700 lg:min-h-0">
        <input
          type="checkbox"
          checked={question.validationRules?.randomizeOptions ?? false}
          onChange={(e) =>
            onEdit({
              ...question,
              validationRules: { ...question.validationRules, randomizeOptions: e.target.checked },
            })
          }
          className="h-4 w-4 shrink-0 accent-primary-600"
        />
        Acak urutan opsi (opsi "Lainnya" tetap di bawah)
      </label>
    </div>
  );
}

/**
 * Editor "Penugasan Acak (Eksperimen)". Tiap baris = satu KELOMPOK (arm) dengan
 * KODE angka (untuk SPSS) + nama. Sistem mengundi satu kelompok per responden
 * dengan peluang sama rata; pertanyaan ini tidak ditampilkan ke responden dan
 * dipakai sebagai sumber di tab "Aturan Tampil" (mis. tampil jika Kode = 2).
 */
export function ArmConfig({
  question,
  onEdit,
}: {
  question: Question;
  onEdit: (q: Question) => void;
}) {
  const arms = question.options ?? [];

  return (
    <div className="space-y-2">
      <Notice title="Cara kerja">
        Pertanyaan ini <strong>tidak ditampilkan</strong> ke responden. Sistem mengundi satu
        kelompok di bawah (peluang sama rata) untuk tiap responden. Lalu di tab{' '}
        <strong>“Aturan Tampil”</strong> pada pertanyaan cabang, pilih sumber pertanyaan ini dan
        kode kelompoknya — mis. “tampilkan jika [pertanyaan ini] = 2”. Gunakan{' '}
        <strong>kode angka</strong> (1, 2, 3) agar mudah diolah di SPSS.
      </Notice>
      <label className="block text-xs font-medium text-gray-600">Kelompok (arm)</label>
      {arms.map((arm, idx) => (
        <div key={arm.id} className="flex items-center gap-2">
          <div className="w-20 shrink-0">
            <input
              type="text"
              value={arm.value}
              onChange={(e) => {
                const next = [...arms];
                next[idx] = { ...arm, value: e.target.value.trim() };
                onEdit({ ...question, options: next });
              }}
              className={`${fieldCls} text-center`}
              placeholder="Kode"
              title="Kode kelompok (angka untuk SPSS)"
            />
          </div>
          <input
            type="text"
            value={arm.label}
            onChange={(e) => {
              const next = [...arms];
              next[idx] = { ...arm, label: e.target.value };
              onEdit({ ...question, options: next });
            }}
            className={`${fieldCls} min-w-0 flex-1`}
            placeholder={`Nama kelompok ${idx + 1}`}
          />
          <IconButton
            aria-label="Hapus kelompok"
            destructive
            onClick={() => onEdit({ ...question, options: arms.filter((_, i) => i !== idx) })}
            disabled={arms.length <= 2}
          >
            <Trash2 className="h-[18px] w-[18px]" strokeWidth={1.75} />
          </IconButton>
        </div>
      ))}
      <Button
        type="button"
        variant="ghost"
        size="sm"
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
      >
        <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" /> Tambah Kelompok
      </Button>
      <p className="text-xs text-gray-500">Minimal 2 kelompok.</p>
    </div>
  );
}

export function MatrixConfig({
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
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Baris</label>
        {rows.map((row, i) => (
          <div key={i} className="mb-1 flex items-center gap-1">
            <input
              value={row}
              onChange={(e) => {
                const n = [...rows];
                n[i] = e.target.value;
                updateRows(n);
              }}
              className={`${fieldCls} min-w-0 flex-1`}
              placeholder={`Baris ${i + 1}`}
            />
            <IconButton
              aria-label="Hapus baris"
              destructive
              onClick={() => updateRows(rows.filter((_, j) => j !== i))}
            >
              <Trash2 className="h-[18px] w-[18px]" strokeWidth={1.75} />
            </IconButton>
          </div>
        ))}
        <Button type="button" variant="ghost" size="sm" onClick={() => updateRows([...rows, ''])}>
          <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" /> Baris
        </Button>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Kolom</label>
        {cols.map((col, i) => (
          <div key={i} className="mb-1 flex items-center gap-1">
            <input
              value={col}
              onChange={(e) => {
                const n = [...cols];
                n[i] = e.target.value;
                updateCols(n);
              }}
              className={`${fieldCls} min-w-0 flex-1`}
              placeholder={`Kolom ${i + 1}`}
            />
            <IconButton
              aria-label="Hapus kolom"
              destructive
              onClick={() => updateCols(cols.filter((_, j) => j !== i))}
            >
              <Trash2 className="h-[18px] w-[18px]" strokeWidth={1.75} />
            </IconButton>
          </div>
        ))}
        <Button type="button" variant="ghost" size="sm" onClick={() => updateCols([...cols, ''])}>
          <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" /> Kolom
        </Button>
      </div>
    </div>
  );
}

export function RatingConfig({
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Nilai Maks</label>
          <select
            value={rules.ratingMax ?? 5}
            onChange={(e) => set({ ratingMax: Number(e.target.value) })}
            className={fieldCls}
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
            className={fieldCls}
          >
            <option value="star">Bintang</option>
            <option value="number">Angka</option>
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Label kiri (nilai rendah)
          </label>
          <input
            type="text"
            value={rules.ratingMinLabel ?? ''}
            onChange={(e) => set({ ratingMinLabel: e.target.value })}
            className={fieldCls}
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
            className={fieldCls}
            placeholder="Sangat Puas"
          />
        </div>
      </div>
    </div>
  );
}

export function RegionConfig({
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
          className={fieldCls}
        >
          <option value="province">Provinsi</option>
          <option value="regency">Kabupaten/Kota</option>
          <option value="district">Kecamatan</option>
          <option value="village">Kelurahan/Desa</option>
        </select>
        <p className="mt-1 text-xs text-gray-500">Responden wajib memilih hingga level ini.</p>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">
          Kunci Provinsi (opsional)
        </label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
            className={fieldCls}
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
            className={fieldCls}
            placeholder="Nama provinsi"
          />
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Isi ID & nama untuk mengunci provinsi. Contoh: ID=32, Nama=JAWA BARAT
        </p>
      </div>
      {rules.lockedProvince && (
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">
            Kunci Kabupaten/Kota (opsional)
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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
              className={fieldCls}
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
              className={fieldCls}
              placeholder="Nama kab/kota"
            />
          </div>
        </div>
      )}
    </div>
  );
}

export function NumericConfig({
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
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Nilai Min</label>
        <input
          type="number"
          value={range.min ?? ''}
          onChange={(e) => set({ numericRange: { ...range, min: Number(e.target.value) } })}
          className={fieldCls}
          placeholder="0"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Nilai Maks</label>
        <input
          type="number"
          value={range.max ?? ''}
          onChange={(e) => set({ numericRange: { ...range, max: Number(e.target.value) } })}
          className={fieldCls}
          placeholder="100"
        />
      </div>
    </div>
  );
}

export function UniqueIdConfig({
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
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <div>
        <label className="block text-xs font-medium text-gray-600 mb-1">Min Digit</label>
        <input
          type="number"
          value={rules.minLength ?? ''}
          onChange={(e) => set({ minLength: e.target.value ? Number(e.target.value) : undefined })}
          className={fieldCls}
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
          className={fieldCls}
          placeholder="10"
          min={1}
        />
      </div>
      <div className="text-xs text-gray-500 sm:col-span-2">
        Hanya angka. Unik per survei (duplikat ditolak sisi server).
      </div>
    </div>
  );
}

// ─── Skip Logic / Visibility Editor ──────────────────────────────────────────
