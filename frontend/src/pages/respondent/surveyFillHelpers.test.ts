import { describe, it, expect } from 'vitest';
import type { Question, SurveyFillData, AnswerValue } from '@/types/survey';
import { computeResumePage } from './surveyFillHelpers';

function q(partial: Partial<Question> & { id: string }): Question {
  return {
    type: 'short_text',
    text: 'T',
    required: false,
    page: 1,
    ...partial,
  };
}

function survey(
  questions: Question[],
  opts: { formMode?: SurveyFillData['formMode']; totalPages?: number } = {},
): SurveyFillData {
  return {
    id: 's1',
    title: 'S',
    description: '',
    questions,
    totalPages: opts.totalPages ?? 1,
    formMode: opts.formMode,
    rewardMode: 'auto_point',
    responseId: 'r1',
  };
}

describe('computeResumePage', () => {
  it('wizard: lanjut ke langkah pertanyaan aktif pertama yang belum diisi', () => {
    const qs = [
      q({ id: 'a', required: true }),
      q({ id: 'b', required: true }),
      q({ id: 'c', required: true }),
    ];
    const ans: Record<string, AnswerValue> = { a: 'x', b: '' }; // a terisi, b kosong
    expect(computeResumePage(survey(qs, { formMode: 'wizard' }), ans)).toBe(2);
  });

  it('wizard: semua terisi → langkah terakhir', () => {
    const qs = [q({ id: 'a' }), q({ id: 'b' }), q({ id: 'c' })];
    const ans = { a: 'x', b: 'y', c: 'z' };
    expect(computeResumePage(survey(qs, { formMode: 'wizard' }), ans)).toBe(3);
  });

  it('wizard: sadar-cabang — pertanyaan tersembunyi tidak dihitung', () => {
    // b hanya tampil jika a = "ya"; di sini a = "tidak" → b tersembunyi.
    const qs = [
      q({ id: 'a' }),
      q({
        id: 'b',
        visibilityConditions: [{ questionId: 'a', operator: 'equals', value: 'ya' }],
      }),
      q({ id: 'c' }),
    ];
    const ans = { a: 'tidak' }; // a terisi, b tersembunyi, c belum diisi
    // Aktif = [a, c]; pertama belum diisi = c → langkah ke-2 (di antara aktif).
    expect(computeResumePage(survey(qs, { formMode: 'wizard' }), ans)).toBe(2);
  });

  it('paginated: lanjut ke HALAMAN pertanyaan pertama yang belum diisi', () => {
    const qs = [q({ id: 'a', page: 1 }), q({ id: 'b', page: 2 }), q({ id: 'c', page: 3 })];
    const ans = { a: 'x' }; // hal 1 terisi; b (hal 2) kosong
    expect(computeResumePage(survey(qs, { formMode: 'paginated', totalPages: 3 }), ans)).toBe(2);
  });

  it('paginated: semua terisi → halaman terakhir', () => {
    const qs = [q({ id: 'a', page: 1 }), q({ id: 'b', page: 2 })];
    const ans = { a: 'x', b: 'y' };
    expect(computeResumePage(survey(qs, { formMode: 'paginated', totalPages: 2 }), ans)).toBe(2);
  });

  it('tanpa pertanyaan aktif → 1', () => {
    expect(computeResumePage(survey([], { formMode: 'wizard' }), {})).toBe(1);
  });
});
