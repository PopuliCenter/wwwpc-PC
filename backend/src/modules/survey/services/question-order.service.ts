import { Injectable } from '@nestjs/common';

/** Bentuk minimum yang dibutuhkan untuk mengurutkan — memudahkan pengujian. */
export interface OrderableQuestion {
  id: string;
  orderIndex: number;
  randomizeGroup?: string | null;
  pinPosition?: boolean;
}

/**
 * Hash string → 32-bit (xmur3). Dipakai menurunkan seed dari responseId,
 * supaya urutan acak SAMA setiap kali responden membuka kembali survei
 * yang sedang dikerjakan (kalau tidak, urutan berubah tiap muat ulang dan
 * responden — juga TPD yang mendampingi — jadi bingung).
 */
function hashSeed(str: string): number {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}

/** PRNG deterministik (mulberry32) — seed sama ⇒ deret sama. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Mengacak urutan pertanyaan per BLOK secara deterministik.
 *
 * Aturan penting: anggota satu blok diacak **di antara posisi mereka sendiri**,
 * bukan dipindah ke mana saja. Jadi himpunan posisi yang ditempati blok tidak
 * berubah — ini yang menjaga rentang 'jump_to' (yang dihitung dari order_index)
 * tetap benar, dan menjaga pertanyaan di luar blok tetap di tempatnya.
 */
@Injectable()
export class QuestionOrderService {
  /**
   * @param questions Pertanyaan survei (urutan bebas — akan diurutkan ulang by orderIndex).
   * @param seed      Kunci pengacakan; pakai responseId agar stabil per responden.
   *                  Kosong/null ⇒ tidak diacak sama sekali (mis. mode surveyor/TPD).
   */
  order<T extends OrderableQuestion>(questions: T[], seed: string | null | undefined): T[] {
    const sorted = [...questions].sort((a, b) => a.orderIndex - b.orderIndex);
    if (!seed) return sorted;

    // Kumpulkan posisi yang boleh ditukar, per nama blok.
    const slotsByGroup = new Map<string, number[]>();
    sorted.forEach((q, index) => {
      const group = q.randomizeGroup;
      if (!group || q.pinPosition) return;
      const slots = slotsByGroup.get(group) ?? [];
      slots.push(index);
      slotsByGroup.set(group, slots);
    });

    const result = [...sorted];
    // Urutkan nama blok agar hasil tidak bergantung pada urutan iterasi Map.
    for (const group of [...slotsByGroup.keys()].sort()) {
      const slots = slotsByGroup.get(group)!;
      if (slots.length < 2) continue;

      const members = slots.map((slot) => sorted[slot]);
      const shuffled = this.shuffle(members, `${seed}:${group}`);
      slots.forEach((slot, i) => {
        result[slot] = shuffled[i];
      });
    }
    return result;
  }

  /** Fisher-Yates deterministik: seed sama ⇒ hasil sama. */
  shuffle<T>(items: T[], seed: string): T[] {
    const rand = mulberry32(hashSeed(seed));
    const out = [...items];
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
}
