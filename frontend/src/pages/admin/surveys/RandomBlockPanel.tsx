import { useMemo, useState } from 'react';
import { Shuffle, Pin, Trash2, TriangleAlert, Plus } from 'lucide-react';
import type { Question } from './surveyEditTypes';

/**
 * Pengelola BLOK ACAK. Satu survei boleh punya banyak blok sekaligus
 * (mis. 10–50 blok "A", 58–70 blok "B", 90–100 blok "C") — tiap blok diacak
 * sendiri-sendiri, dan pertanyaan di luar blok tidak pernah bergeser.
 *
 * Blok disimpan sebagai NAMA pada tiap pertanyaan, bukan sebagai rentang nomor.
 * Rentang di bawah hanya alat bantu untuk menempelkan nama itu sekaligus; jadi
 * saat pertanyaan disisipkan atau dihapus, keanggotaan blok ikut sendiri dan
 * tidak meleset seperti kalau rentang disimpan sebagai angka.
 */

/** Warna penanda blok — dipakai konsisten dengan lencana di kartu pertanyaan. */
const BLOCK_COLORS = [
  'bg-violet-100 text-violet-700 ring-violet-200',
  'bg-sky-100 text-sky-700 ring-sky-200',
  'bg-emerald-100 text-emerald-700 ring-emerald-200',
  'bg-amber-100 text-amber-700 ring-amber-200',
  'bg-rose-100 text-rose-700 ring-rose-200',
  'bg-teal-100 text-teal-700 ring-teal-200',
];

/** Warna stabil per nama blok, supaya tidak berubah saat daftar diurut ulang. */
export function blockColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return BLOCK_COLORS[hash % BLOCK_COLORS.length];
}

/** Ringkas nomor anggota blok jadi rentang terbaca: [1,2,3,7] → "1–3, 7". */
export function summarizeRanges(positions: number[]): string {
  if (positions.length === 0) return '—';
  const sorted = [...positions].sort((a, b) => a - b);
  const parts: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (const n of sorted.slice(1)) {
    if (n === prev + 1) {
      prev = n;
      continue;
    }
    parts.push(start === prev ? `${start}` : `${start}–${prev}`);
    start = n;
    prev = n;
  }
  parts.push(start === prev ? `${start}` : `${start}–${prev}`);
  return parts.join(', ');
}

export interface BlockInfo {
  name: string;
  /** Nomor urut (1-based) anggota blok. */
  positions: number[];
  pinnedCount: number;
}

/** Kelompokkan pertanyaan menurut nama bloknya. */
export function collectBlocks(questions: Question[]): BlockInfo[] {
  const map = new Map<string, BlockInfo>();
  questions.forEach((q, idx) => {
    const name = q.randomizeGroup?.trim();
    if (!name) return;
    const info = map.get(name) ?? { name, positions: [], pinnedCount: 0 };
    info.positions.push(idx + 1);
    if (q.pinPosition) info.pinnedCount++;
    map.set(name, info);
  });
  return [...map.values()].sort((a, b) => a.positions[0] - b.positions[0]);
}

/**
 * Cari aturan logika yang jadi tidak masuk akal setelah diacak. Cerminan dari
 * validator backend (assertRandomizationSafe) supaya admin tahu SEBELUM menyimpan,
 * bukan setelah ditolak server.
 */
export function findBlockConflicts(questions: Question[]): string[] {
  const byId = new Map(questions.map((q, idx) => [q.id, { q, no: idx + 1 }]));
  const shuffles = (id?: string) => {
    const entry = id ? byId.get(id) : undefined;
    return !!entry?.q.randomizeGroup?.trim() && !entry.q.pinPosition;
  };
  const problems = new Set<string>();

  questions.forEach((q, idx) => {
    const no = idx + 1;
    const group = q.randomizeGroup?.trim();

    const dependencies = [
      ...(q.skipLogicRules ?? []).map((r) => r.sourceQuestionId),
      ...(q.visibilityRules ?? []).map((r) => r.sourceQuestionId),
    ];
    for (const sourceId of dependencies) {
      const source = byId.get(sourceId);
      if (!source || !group) continue;
      const sameBlock = source.q.randomizeGroup?.trim() === group;
      if (sameBlock && (shuffles(q.id) || shuffles(sourceId))) {
        problems.add(
          `No. ${no} memakai jawaban no. ${source.no} sebagai syarat, tapi keduanya ada di blok "${group}". Setelah diacak, syaratnya bisa muncul belakangan.`,
        );
      }
    }

    for (const rule of q.skipLogicRules ?? []) {
      if (rule.action !== 'jump_to') continue;
      if (shuffles(q.id)) {
        problems.add(
          `No. ${no} memakai lompatan (jump), jadi posisinya harus pasti — keluarkan dari blok "${group}" atau kunci posisinya.`,
        );
      }
      const target = rule.targetQuestionId ? byId.get(rule.targetQuestionId) : undefined;
      if (target && shuffles(rule.targetQuestionId)) {
        problems.add(
          `Tujuan lompatan no. ${target.no} ikut diacak, sehingga jumlah pertanyaan yang terlewati berbeda tiap responden. Kunci posisinya.`,
        );
      }
    }
  });

  return [...problems];
}

interface Props {
  questions: Question[];
  /** Terapkan perubahan blok ke sekumpulan pertanyaan sekaligus. */
  onApply: (updater: (q: Question, index: number) => Question) => void;
  onClose: () => void;
}

export function RandomBlockPanel({ questions, onApply, onClose }: Props) {
  const blocks = useMemo(() => collectBlocks(questions), [questions]);
  const conflicts = useMemo(() => findBlockConflicts(questions), [questions]);

  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const total = questions.length;

  const applyRange = () => {
    const start = Number(from);
    const end = Number(to);
    const blockName = name.trim();

    if (!blockName) return setError('Nama blok belum diisi.');
    if (blockName.length > 50) return setError('Nama blok maksimal 50 karakter.');
    if (!Number.isInteger(start) || !Number.isInteger(end)) {
      return setError('Nomor awal dan akhir harus berupa angka.');
    }
    if (start < 1 || end > total) return setError(`Nomor harus di antara 1 dan ${total}.`);
    if (start > end) return setError('Nomor awal tidak boleh lebih besar dari nomor akhir.');
    if (end - start < 1) return setError('Blok acak butuh minimal 2 pertanyaan.');

    setError(null);
    onApply((q, index) => {
      const no = index + 1;
      return no >= start && no <= end ? { ...q, randomizeGroup: blockName } : q;
    });
    setFrom('');
    setTo('');
    setName('');
  };

  const removeBlock = (blockName: string) => {
    onApply((q) =>
      q.randomizeGroup?.trim() === blockName
        ? { ...q, randomizeGroup: null, pinPosition: false }
        : q,
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="my-8 w-full max-w-2xl rounded-xl border border-gray-200 bg-white shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 p-5">
          <div>
            <h2 className="flex items-center gap-2 text-base font-semibold text-gray-900">
              <Shuffle className="h-4 w-4 text-primary-600" /> Blok acak urutan pertanyaan
            </h2>
            <p className="mt-1 text-sm text-gray-500">
              Pertanyaan dalam satu blok tampil dengan urutan berbeda tiap responden. Pertanyaan di
              luar blok tidak pernah bergeser — biarkan bagian data diri dan penyaring tanpa blok.
            </p>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 rounded-md px-2 py-1 text-sm text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        <div className="space-y-5 p-5">
          {/* Tambah blok dari rentang nomor */}
          <div className="rounded-xl border border-gray-200 bg-gray-50/60 p-4">
            <p className="mb-3 text-sm font-medium text-gray-700">
              Jadikan satu rentang sebagai blok
            </p>
            <div className="flex flex-wrap items-end gap-2">
              <label className="text-xs text-gray-500">
                Dari no.
                <input
                  type="number"
                  min={1}
                  max={total}
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="mt-1 block w-20 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                />
              </label>
              <label className="text-xs text-gray-500">
                Sampai no.
                <input
                  type="number"
                  min={1}
                  max={total}
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="mt-1 block w-20 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                />
              </label>
              <label className="flex-1 text-xs text-gray-500">
                Nama blok
                <input
                  type="text"
                  maxLength={50}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="mis. Pengetahuan Politik"
                  list="nama-blok-tersedia"
                  className="mt-1 block w-full rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                />
                <datalist id="nama-blok-tersedia">
                  {blocks.map((b) => (
                    <option key={b.name} value={b.name} />
                  ))}
                </datalist>
              </label>
              <button
                type="button"
                onClick={applyRange}
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700"
              >
                <Plus className="h-3.5 w-3.5" /> Terapkan
              </button>
            </div>
            {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
            <p className="mt-2 text-xs text-gray-500">
              Pakai nama yang sama untuk menggabungkan beberapa rentang jadi satu blok, atau nama
              berbeda supaya tiap rentang diacak sendiri-sendiri.
            </p>
          </div>

          {/* Daftar blok yang sudah ada */}
          <div>
            <p className="mb-2 text-sm font-medium text-gray-700">Blok pada survei ini</p>
            {blocks.length === 0 ? (
              <p className="rounded-xl border border-dashed border-gray-200 py-6 text-center text-sm text-gray-400">
                Belum ada blok acak. Semua pertanyaan tampil berurutan.
              </p>
            ) : (
              <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200">
                {blocks.map((b) => (
                  <li key={b.name} className="flex items-center gap-3 px-4 py-3">
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${blockColor(b.name)}`}
                    >
                      {b.name}
                    </span>
                    <span className="flex-1 truncate text-sm text-gray-600">
                      No. {summarizeRanges(b.positions)}
                      <span className="text-gray-400"> · {b.positions.length} pertanyaan</span>
                      {b.pinnedCount > 0 && (
                        <span className="ml-1 inline-flex items-center gap-0.5 text-gray-400">
                          <Pin className="h-3 w-3" />
                          {b.pinnedCount} terkunci
                        </span>
                      )}
                    </span>
                    {b.positions.length < 2 && (
                      <span className="shrink-0 text-xs text-amber-600">
                        Perlu min. 2 pertanyaan
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => removeBlock(b.name)}
                      title={`Bubarkan blok "${b.name}"`}
                      className="shrink-0 rounded-md p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Peringatan bentrok dengan aturan logika */}
          {conflicts.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="flex items-center gap-2 text-sm font-medium text-amber-800">
                <TriangleAlert className="h-4 w-4" /> Bentrok dengan aturan logika
              </p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-amber-800">
                {conflicts.map((c) => (
                  <li key={c}>{c}</li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-amber-700">
                Survei tidak bisa disimpan sebelum ini dibereskan.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
