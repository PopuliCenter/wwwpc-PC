import { describe, it, expect, beforeEach } from 'vitest';
import { QuestionOrderService, OrderableQuestion } from './question-order.service';

/** Bangun daftar pertanyaan ringkas: id = huruf, orderIndex = posisi. */
function build(
  spec: Array<[id: string, group?: string | null, pinned?: boolean]>,
): OrderableQuestion[] {
  return spec.map(([id, group, pinned], i) => ({
    id,
    orderIndex: i,
    randomizeGroup: group ?? null,
    pinPosition: pinned ?? false,
  }));
}

const ids = (list: OrderableQuestion[]) => list.map((q) => q.id).join('');

describe('QuestionOrderService', () => {
  let service: QuestionOrderService;

  beforeEach(() => {
    service = new QuestionOrderService();
  });

  it('mengembalikan urutan asli bila tanpa seed (jalur surveyor/TPD)', () => {
    const questions = build([
      ['a'],
      ['b', 'blokA'],
      ['c', 'blokA'],
      ['d', 'blokA'],
      ['e', 'blokA'],
    ]);
    expect(ids(service.order(questions, null))).toBe('abcde');
    expect(ids(service.order(questions, ''))).toBe('abcde');
  });

  it('mengembalikan urutan asli bila tak ada pertanyaan yang masuk blok', () => {
    const questions = build([['a'], ['b'], ['c']]);
    expect(ids(service.order(questions, 'respons-1'))).toBe('abc');
  });

  it('menghasilkan urutan yang sama untuk seed yang sama (stabil saat dilanjutkan)', () => {
    const questions = build([
      ['a'],
      ['b', 'blokA'],
      ['c', 'blokA'],
      ['d', 'blokA'],
      ['e', 'blokA'],
    ]);
    const first = ids(service.order(questions, 'respons-1'));
    const second = ids(service.order(questions, 'respons-1'));
    const third = ids(service.order(questions, 'respons-1'));
    expect(first).toBe(second);
    expect(second).toBe(third);
  });

  it('menghasilkan urutan berbeda untuk responden berbeda', () => {
    // Blok 6 anggota: peluang dua seed menghasilkan urutan identik = 1/720.
    const questions = build([
      ['a', 'blokA'],
      ['b', 'blokA'],
      ['c', 'blokA'],
      ['d', 'blokA'],
      ['e', 'blokA'],
      ['f', 'blokA'],
    ]);
    const hasil = new Set(
      ['r1', 'r2', 'r3', 'r4', 'r5', 'r6'].map((seed) => ids(service.order(questions, seed))),
    );
    expect(hasil.size).toBeGreaterThan(1);
  });

  it('tidak memindahkan pertanyaan di luar blok', () => {
    // 'a' (data diri) dan 'z' (penutup) harus tetap di ujung-ujungnya.
    const questions = build([['a'], ['b', 'blokA'], ['c', 'blokA'], ['d', 'blokA'], ['z']]);
    for (const seed of ['r1', 'r2', 'r3', 'r4', 'r5']) {
      const hasil = ids(service.order(questions, seed));
      expect(hasil[0]).toBe('a');
      expect(hasil[4]).toBe('z');
      expect(hasil.split('').sort().join('')).toBe('abcdz');
    }
  });

  it('mempertahankan posisi pertanyaan yang dikunci walau bloknya diacak', () => {
    // 'c' dikunci di posisi indeks 2 — apa pun seed-nya, harus tetap di sana.
    const questions = build([
      ['a', 'blokA'],
      ['b', 'blokA'],
      ['c', 'blokA', true],
      ['d', 'blokA'],
      ['e', 'blokA'],
    ]);
    for (const seed of ['r1', 'r2', 'r3', 'r4', 'r5', 'r6']) {
      expect(ids(service.order(questions, seed))[2]).toBe('c');
    }
  });

  it('mengacak tiap blok secara terpisah — anggota tidak bocor antar blok', () => {
    const questions = build([
      ['a', 'blokA'],
      ['b', 'blokA'],
      ['c', 'blokA'],
      ['x', 'blokB'],
      ['y', 'blokB'],
      ['z', 'blokB'],
    ]);
    for (const seed of ['r1', 'r2', 'r3', 'r4', 'r5']) {
      const hasil = ids(service.order(questions, seed));
      expect(hasil.slice(0, 3).split('').sort().join('')).toBe('abc');
      expect(hasil.slice(3).split('').sort().join('')).toBe('xyz');
    }
  });

  it('menjaga himpunan posisi blok walau anggotanya berselang-seling', () => {
    // Blok menempati indeks 1 dan 3; indeks 0/2/4 milik pertanyaan lain.
    const questions = build([['a'], ['b', 'blokA'], ['c'], ['d', 'blokA'], ['e']]);
    for (const seed of ['r1', 'r2', 'r3', 'r4', 'r5']) {
      const hasil = ids(service.order(questions, seed));
      expect(hasil[0]).toBe('a');
      expect(hasil[2]).toBe('c');
      expect(hasil[4]).toBe('e');
      expect(['b', 'd']).toContain(hasil[1]);
      expect(['b', 'd']).toContain(hasil[3]);
    }
  });

  it('tidak mengubah array masukan', () => {
    const questions = build([
      ['a', 'blokA'],
      ['b', 'blokA'],
      ['c', 'blokA'],
    ]);
    const salinan = ids(questions);
    service.order(questions, 'respons-1');
    expect(ids(questions)).toBe(salinan);
  });

  it('mengurutkan ulang berdasar orderIndex, bukan urutan array masukan', () => {
    const questions: OrderableQuestion[] = [
      { id: 'c', orderIndex: 2 },
      { id: 'a', orderIndex: 0 },
      { id: 'b', orderIndex: 1 },
    ];
    expect(ids(service.order(questions, 'respons-1'))).toBe('abc');
  });

  it('blok beranggota satu tetap di tempatnya', () => {
    const questions = build([['a'], ['b', 'blokA'], ['c']]);
    expect(ids(service.order(questions, 'respons-1'))).toBe('abc');
  });
});
