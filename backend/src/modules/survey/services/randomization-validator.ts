import { BadRequestException } from '@nestjs/common';

/** Pertanyaan sebagaimana dilihat validator (id + setelan blok acak). */
export interface RandomizableQuestion {
  id: string;
  /** Untuk pesan error yang bisa dimengerti admin. */
  label?: string;
  randomizeGroup?: string | null;
  pinPosition?: boolean;
}

/** Aturan yang bergantung pada jawaban pertanyaan lain (skip / tampil-sembunyi). */
export interface DependentRule {
  /** Pertanyaan pemilik aturan. */
  questionId: string;
  /** Pertanyaan yang jawabannya jadi syarat. */
  sourceQuestionId: string;
  action?: 'skip' | 'jump_to' | string;
  targetQuestionId?: string | null;
}

/**
 * Posisi pertanyaan ini bisa berpindah saat pengacakan berjalan?
 * Pertanyaan ber-`pinPosition` tetap di slotnya, jadi dianggap pasti.
 */
function isShuffled(q: RandomizableQuestion | undefined): boolean {
  return !!q && !!q.randomizeGroup && !q.pinPosition;
}

/** Dua pertanyaan yang urutan relatifnya tidak bisa dipastikan sebelum diacak. */
function orderIsAmbiguous(
  a: RandomizableQuestion | undefined,
  b: RandomizableQuestion | undefined,
): boolean {
  if (!a || !b) return false;
  if (!a.randomizeGroup || a.randomizeGroup !== b.randomizeGroup) return false;
  // Sama-sama dikunci ⇒ urutannya tetap, aman.
  return isShuffled(a) || isShuffled(b);
}

function describe(q: RandomizableQuestion | undefined, fallback: string): string {
  const text = q?.label?.trim();
  if (!text) return fallback;
  return text.length > 60 ? `"${text.slice(0, 57)}..."` : `"${text}"`;
}

/**
 * Menolak kombinasi aturan yang menjadi tidak masuk akal begitu urutan
 * pertanyaan diacak. Dipanggil SEBELUM data ditulis.
 *
 * Tiga hal yang ditolak:
 *
 * 1. Syarat & pemiliknya berada di satu blok acak — sesudah diacak, pertanyaan
 *    bersyarat bisa muncul lebih dulu daripada pertanyaan syaratnya, sehingga
 *    kondisinya tidak punya jawaban untuk dinilai.
 * 2. Titik awal 'jump_to' ikut diacak — jangkauan lompatan dihitung dari
 *    order_index, jadi posisinya harus pasti.
 * 3. Titik tujuan 'jump_to' ikut diacak — bila tujuan berpindah-pindah di dalam
 *    bloknya, jumlah pertanyaan yang terlewati berubah tiap responden.
 */
export function assertRandomizationSafe(
  questions: RandomizableQuestion[],
  rules: DependentRule[],
): void {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const problems: string[] = [];

  for (const rule of rules) {
    const owner = byId.get(rule.questionId);
    const source = byId.get(rule.sourceQuestionId);
    if (!owner || !source) continue; // referensi menggantung — ditangani di tempat lain

    if (orderIsAmbiguous(owner, source)) {
      problems.push(
        `${describe(owner, 'Sebuah pertanyaan')} memakai jawaban ${describe(source, 'pertanyaan lain')} ` +
          `sebagai syarat, padahal keduanya ada di blok acak "${owner.randomizeGroup}". ` +
          `Setelah diacak, pertanyaan syaratnya bisa muncul belakangan. ` +
          `Pindahkan salah satunya ke luar blok, atau kunci posisi keduanya.`,
      );
    }

    if (rule.action !== 'jump_to') continue;

    if (isShuffled(owner)) {
      problems.push(
        `${describe(owner, 'Sebuah pertanyaan')} memakai lompatan (jump), jadi posisinya harus pasti. ` +
          `Keluarkan dari blok acak "${owner.randomizeGroup}" atau kunci posisinya.`,
      );
    }

    const target = rule.targetQuestionId ? byId.get(rule.targetQuestionId) : undefined;
    if (isShuffled(target)) {
      problems.push(
        `Tujuan lompatan ${describe(target, 'sebuah pertanyaan')} ada di blok acak ` +
          `"${target!.randomizeGroup}", sehingga jumlah pertanyaan yang terlewati berbeda-beda ` +
          `tiap responden. Kunci posisi pertanyaan tujuan atau keluarkan dari blok.`,
      );
    }
  }

  if (problems.length > 0) {
    // Pesan bisa muncul berulang bila satu pertanyaan punya banyak aturan serupa.
    const unique = [...new Set(problems)];
    throw new BadRequestException(
      `Pengacakan urutan bentrok dengan aturan logika: ${unique.join(' ')}`,
    );
  }
}
