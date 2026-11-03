import { useMemo, useState, type ReactNode } from 'react';
import { Pin, Trash2, Plus, X } from 'lucide-react';
import { Badge } from '@/components/common/Badge';
import { Button } from '@/components/common/Button';
import { IconButton } from '@/components/common/IconButton';
import { ModalShell } from '@/components/common/ModalShell';
import { Notice } from '@/components/common/Notice';
import { fieldCls } from '@/components/common/fieldStyles';
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

/**
 * Gaya penanda blok, dipakai konsisten dengan lencana di kartu pertanyaan. Hanya
 * navy dan abu-abu: hijau, kuning, dan merah sudah berarti status. Empat gaya saja
 * tidak cukup untuk banyak blok, jadi identitas blok dibawa huruf (A, B, C).
 */
const BLOCK_COLORS = [
  'bg-primary-100 text-primary-900 border-primary-200',
  'bg-gray-100 text-gray-800 border-gray-300',
  'bg-white text-gray-800 border-gray-300',
  'bg-primary-800 text-white border-primary-800',
];

/**
 * Peta nama blok → gaya, dibagikan menurut URUTAN kemunculan blok.
 *
 * Sempat memakai hash dari nama blok agar warnanya melekat pada nama, tapi
 * dengan palet terbatas dua blok gampang bertabrakan — pada survei uji,
 * "Elektabilitas" dan "Media & Informasi" sama-sama ungu, sehingga batas blok
 * justru tak terbaca. Pembagian berdasar urutan menjamin blok yang berdekatan
 * selalu beda gaya, dan itu yang sebenarnya dibutuhkan mata saat menyusuri
 * daftar pertanyaan.
 */
export function buildBlockColors(questions: Question[]): Record<string, string> {
  const colors: Record<string, string> = {};
  collectBlocks(questions).forEach((block, i) => {
    colors[block.name] = BLOCK_COLORS[i % BLOCK_COLORS.length];
  });
  return colors;
}

/** Urutan blok jadi huruf: 0 → A, 25 → Z, 26 → AA. */
function blockLetter(index: number): string {
  let n = index;
  let out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

/** Peta nama blok → huruf, mengikuti urutan yang sama dengan buildBlockColors. */
export function buildBlockLetters(questions: Question[]): Record<string, string> {
  const letters: Record<string, string> = {};
  collectBlocks(questions).forEach((block, i) => {
    letters[block.name] = blockLetter(i);
  });
  return letters;
}

/** Penanda satu blok: huruf + nama, dengan gaya dari buildBlockColors. */
export function BlockChip({
  name,
  letter,
  colorCls,
  children,
}: {
  name: string;
  letter: string;
  colorCls: string;
  /** Ikon tambahan di dalam penanda (mis. Shuffle atau Pin). */
  children?: ReactNode;
}) {
  return (
    <span
      className={`inline-flex max-w-full items-center gap-1 rounded-sm border px-1.5 py-0.5 text-xs ${colorCls}`}
    >
      <span className="font-semibold">{letter}</span>
      <span className="min-w-0 truncate">{name}</span>
      {children}
    </span>
  );
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
  const blockColors = useMemo(() => buildBlockColors(questions), [questions]);
  const blockLetters = useMemo(() => buildBlockLetters(questions), [questions]);
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
    <ModalShell label="Blok acak urutan pertanyaan" onClose={onClose}>
      <div className="flex items-start justify-between gap-4 border-b border-gray-200 p-4 sm:p-5">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-gray-900">Blok acak urutan pertanyaan</h2>
          <p className="mt-1 text-sm text-gray-600">
            Pertanyaan dalam satu blok tampil dengan urutan berbeda tiap responden. Pertanyaan di
            luar blok tidak pernah bergeser — biarkan bagian data diri dan penyaring tanpa blok.
          </p>
        </div>
        <IconButton aria-label="Tutup" onClick={onClose}>
          <X className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </IconButton>
      </div>

      <div className="space-y-5 p-4 sm:p-5">
        {/* Tambah blok dari rentang nomor */}
        <div className="rounded-lg border border-gray-200 bg-gray-50 p-4">
          <p className="mb-3 text-sm font-medium text-gray-700">
            Jadikan satu rentang sebagai blok
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="w-24 text-xs text-gray-600">
              Dari no.
              <input
                type="number"
                min={1}
                max={total}
                value={from}
                onChange={(e) => setFrom(e.target.value)}
                className={`${fieldCls} mt-1`}
              />
            </label>
            <label className="w-24 text-xs text-gray-600">
              Sampai no.
              <input
                type="number"
                min={1}
                max={total}
                value={to}
                onChange={(e) => setTo(e.target.value)}
                className={`${fieldCls} mt-1`}
              />
            </label>
            <label className="min-w-40 flex-1 text-xs text-gray-600">
              Nama blok
              <input
                type="text"
                maxLength={50}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="mis. Pengetahuan Politik"
                list="nama-blok-tersedia"
                className={`${fieldCls} mt-1`}
              />
              <datalist id="nama-blok-tersedia">
                {blocks.map((b) => (
                  <option key={b.name} value={b.name} />
                ))}
              </datalist>
            </label>
            <Button type="button" onClick={applyRange}>
              <Plus className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" /> Terapkan
            </Button>
          </div>
          {error && (
            <p role="alert" className="mt-2 text-sm text-danger-fg">
              {error}
            </p>
          )}
          <p className="mt-2 text-xs text-gray-600">
            Pakai nama yang sama untuk menggabungkan beberapa rentang jadi satu blok, atau nama
            berbeda supaya tiap rentang diacak sendiri-sendiri.
          </p>
        </div>

        {/* Daftar blok yang sudah ada */}
        <div>
          <p className="mb-2 text-sm font-medium text-gray-700">Blok pada survei ini</p>
          {blocks.length === 0 ? (
            <p className="py-6 text-center text-sm text-gray-600">
              Belum ada blok acak. Semua pertanyaan tampil berurutan.
            </p>
          ) : (
            <ul className="divide-y divide-gray-100 overflow-hidden rounded-lg border border-gray-200">
              {blocks.map((b) => (
                <li key={b.name} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2">
                  <BlockChip
                    name={b.name}
                    letter={blockLetters[b.name]}
                    colorCls={blockColors[b.name]}
                  />
                  <span className="min-w-0 flex-1 text-sm text-gray-600 tabular-nums">
                    No. {summarizeRanges(b.positions)}
                    <span className="text-gray-500"> · {b.positions.length} pertanyaan</span>
                    {b.pinnedCount > 0 && (
                      <span className="ml-1 inline-flex items-center gap-0.5 text-gray-500">
                        <Pin className="h-3.5 w-3.5" strokeWidth={1.75} aria-hidden="true" />
                        {b.pinnedCount} terkunci
                      </span>
                    )}
                  </span>
                  {b.positions.length < 2 && (
                    <Badge tone="warning" className="shrink-0">
                      Perlu min. 2 pertanyaan
                    </Badge>
                  )}
                  <IconButton
                    destructive
                    aria-label={`Bubarkan blok "${b.name}"`}
                    onClick={() => removeBlock(b.name)}
                  >
                    <Trash2 className="h-[18px] w-[18px]" strokeWidth={1.75} />
                  </IconButton>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Peringatan bentrok dengan aturan logika */}
        {conflicts.length > 0 && (
          <Notice tone="warning" role="alert" title="Bentrok dengan aturan logika">
            <ul className="mt-1 list-disc space-y-1 pl-5">
              {conflicts.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <p className="mt-2">Survei tidak bisa disimpan sebelum ini dibereskan.</p>
          </Notice>
        )}
      </div>
    </ModalShell>
  );
}
