import { describe, it, expect } from 'vitest';
import { BadRequestException } from '@nestjs/common';
import {
  assertRandomizationSafe,
  RandomizableQuestion,
  DependentRule,
} from './randomization-validator';

const q = (id: string, group: string | null = null, pinPosition = false): RandomizableQuestion => ({
  id,
  label: `Pertanyaan ${id}`,
  randomizeGroup: group,
  pinPosition,
});

const skip = (questionId: string, sourceQuestionId: string): DependentRule => ({
  questionId,
  sourceQuestionId,
  action: 'skip',
});

const jump = (questionId: string, sourceQuestionId: string, target: string): DependentRule => ({
  questionId,
  sourceQuestionId,
  action: 'jump_to',
  targetQuestionId: target,
});

describe('assertRandomizationSafe', () => {
  it('meloloskan survei tanpa blok acak sama sekali', () => {
    expect(() =>
      assertRandomizationSafe([q('a'), q('b'), q('c')], [skip('c', 'a'), jump('a', 'a', 'c')]),
    ).not.toThrow();
  });

  it('meloloskan syarat dari luar blok ke pertanyaan di dalam blok', () => {
    // 'a' di luar blok, jadi selalu dijawab sebelum blok mana pun setelahnya.
    expect(() =>
      assertRandomizationSafe([q('a'), q('b', 'blokA'), q('c', 'blokA')], [skip('c', 'a')]),
    ).not.toThrow();
  });

  it('menolak syarat dan pemiliknya berada di satu blok acak', () => {
    expect(() =>
      assertRandomizationSafe([q('a', 'blokA'), q('b', 'blokA')], [skip('b', 'a')]),
    ).toThrow(BadRequestException);
  });

  it('meloloskan pasangan sekelompok bila KEDUANYA dikunci posisinya', () => {
    expect(() =>
      assertRandomizationSafe([q('a', 'blokA', true), q('b', 'blokA', true)], [skip('b', 'a')]),
    ).not.toThrow();
  });

  it('menolak bila hanya salah satu yang dikunci — yang lain masih bisa berpindah', () => {
    expect(() =>
      assertRandomizationSafe([q('a', 'blokA', true), q('b', 'blokA')], [skip('b', 'a')]),
    ).toThrow(BadRequestException);
  });

  it('meloloskan pasangan di blok acak yang BERBEDA', () => {
    expect(() =>
      assertRandomizationSafe([q('a', 'blokA'), q('b', 'blokB')], [skip('b', 'a')]),
    ).not.toThrow();
  });

  it('menolak titik awal jump_to yang ikut diacak', () => {
    expect(() =>
      assertRandomizationSafe([q('a'), q('b', 'blokA'), q('c')], [jump('b', 'a', 'c')]),
    ).toThrow(BadRequestException);
  });

  it('menolak tujuan jump_to yang ikut diacak', () => {
    expect(() =>
      assertRandomizationSafe([q('a'), q('b'), q('c', 'blokA')], [jump('b', 'a', 'c')]),
    ).toThrow(BadRequestException);
  });

  it('meloloskan jump_to bila kedua ujungnya dikunci posisinya', () => {
    expect(() =>
      assertRandomizationSafe(
        [q('a'), q('b', 'blokA', true), q('c', 'blokA', true)],
        [jump('b', 'a', 'c')],
      ),
    ).not.toThrow();
  });

  it('mengabaikan aturan dengan referensi menggantung (draft di builder)', () => {
    expect(() =>
      assertRandomizationSafe([q('a', 'blokA')], [skip('a', 'tidak-ada')]),
    ).not.toThrow();
  });

  it('menyebut nama blok dan teks pertanyaan pada pesan error', () => {
    let pesan = '';
    try {
      assertRandomizationSafe([q('a', 'Pengetahuan'), q('b', 'Pengetahuan')], [skip('b', 'a')]);
    } catch (e) {
      pesan = (e as BadRequestException).message;
    }
    expect(pesan).toContain('Pengetahuan');
    expect(pesan).toContain('Pertanyaan b');
    expect(pesan).toContain('Pertanyaan a');
  });

  it('tidak mengulang pesan yang sama berkali-kali', () => {
    const rules = [skip('b', 'a'), skip('b', 'a'), skip('b', 'a')];
    let pesan = '';
    try {
      assertRandomizationSafe([q('a', 'blokA'), q('b', 'blokA')], rules);
    } catch (e) {
      pesan = (e as BadRequestException).message;
    }
    expect(pesan.match(/blok acak "blokA"/g)).toHaveLength(1);
  });
});
