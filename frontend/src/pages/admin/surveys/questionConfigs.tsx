import type { Question, QuestionOption, ValidationRules } from './surveyEditTypes';

/**
 * Komponen KONFIGURASI per tipe pertanyaan untuk editor survei (dipakai oleh
 * SortableQuestionCard). Semua terkontrol: menerima {question, onEdit}.
 */

export function InfoHint({ text }: { text: string }) {
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
