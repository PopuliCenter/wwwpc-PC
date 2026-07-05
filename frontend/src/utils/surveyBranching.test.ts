import { describe, it, expect } from 'vitest';
import type { Question } from '@/types/survey';
import {
  evaluateCondition,
  isQuestionVisible,
  shouldSkipQuestion,
  isActive,
  type AnswerMap,
} from './surveyBranching';

/** Bangun pertanyaan minimal untuk pengujian. */
function q(partial: Partial<Question>): Question {
  return {
    id: 'q1',
    type: 'short_text',
    text: 'T',
    required: false,
    page: 1,
    ...partial,
  };
}

describe('evaluateCondition', () => {
  it('jawaban kosong → selalu false (semua operator)', () => {
    const answers: AnswerMap = { a: null };
    for (const operator of [
      'equals',
      'not_equals',
      'contains',
      'greater_than',
      'less_than',
    ] as const) {
      expect(evaluateCondition(answers, { questionId: 'a', operator, value: 'x' })).toBe(false);
    }
    // questionId tak ada di peta jawaban
    expect(evaluateCondition({}, { questionId: 'a', operator: 'equals', value: 'x' })).toBe(false);
  });

  it('equals / not_equals pada string', () => {
    const answers: AnswerMap = { a: 'ya' };
    expect(evaluateCondition(answers, { questionId: 'a', operator: 'equals', value: 'ya' })).toBe(
      true,
    );
    expect(
      evaluateCondition(answers, { questionId: 'a', operator: 'equals', value: 'tidak' }),
    ).toBe(false);
    expect(
      evaluateCondition(answers, { questionId: 'a', operator: 'not_equals', value: 'tidak' }),
    ).toBe(true);
  });

  it('array (pilihan ganda) dicek dengan "termasuk", bukan gabung string', () => {
    const answers: AnswerMap = { a: ['merah', 'biru'] };
    expect(evaluateCondition(answers, { questionId: 'a', operator: 'equals', value: 'biru' })).toBe(
      true,
    );
    expect(
      evaluateCondition(answers, { questionId: 'a', operator: 'contains', value: 'merah' }),
    ).toBe(true);
    expect(
      evaluateCondition(answers, { questionId: 'a', operator: 'equals', value: 'hijau' }),
    ).toBe(false);
    expect(
      evaluateCondition(answers, { questionId: 'a', operator: 'not_equals', value: 'hijau' }),
    ).toBe(true);
    // operator numerik tak berlaku pada array → false
    expect(
      evaluateCondition(answers, { questionId: 'a', operator: 'greater_than', value: '1' }),
    ).toBe(false);
  });

  it('contains pada string', () => {
    const answers: AnswerMap = { a: 'saya suka kopi' };
    expect(
      evaluateCondition(answers, { questionId: 'a', operator: 'contains', value: 'kopi' }),
    ).toBe(true);
    expect(
      evaluateCondition(answers, { questionId: 'a', operator: 'contains', value: 'teh' }),
    ).toBe(false);
  });

  it('greater_than / less_than numerik', () => {
    const answers: AnswerMap = { a: '10' };
    expect(
      evaluateCondition(answers, { questionId: 'a', operator: 'greater_than', value: '5' }),
    ).toBe(true);
    expect(evaluateCondition(answers, { questionId: 'a', operator: 'less_than', value: '5' })).toBe(
      false,
    );
    expect(
      evaluateCondition(answers, { questionId: 'a', operator: 'less_than', value: '20' }),
    ).toBe(true);
  });
});

describe('isQuestionVisible', () => {
  it('tanpa syarat visibilitas → selalu tampil', () => {
    expect(isQuestionVisible(q({}), {})).toBe(true);
  });

  it('tampil hanya bila SEMUA syarat terpenuhi', () => {
    const question = q({
      visibilityConditions: [
        { questionId: 'a', operator: 'equals', value: 'ya' },
        { questionId: 'b', operator: 'equals', value: 'ok' },
      ],
    });
    expect(isQuestionVisible(question, { a: 'ya', b: 'ok' })).toBe(true);
    expect(isQuestionVisible(question, { a: 'ya', b: 'no' })).toBe(false);
    expect(isQuestionVisible(question, {})).toBe(false);
  });
});

describe('shouldSkipQuestion', () => {
  it('tanpa syarat skip → tidak pernah dilewati', () => {
    expect(shouldSkipQuestion(q({}), {})).toBe(false);
  });

  it('dilewati bila SALAH SATU syarat skip terpenuhi', () => {
    const question = q({
      skipConditions: [
        { questionId: 'a', operator: 'equals', value: 'lewati' },
        { questionId: 'b', operator: 'equals', value: 'juga' },
      ],
    });
    expect(shouldSkipQuestion(question, { a: 'lewati' })).toBe(true);
    expect(shouldSkipQuestion(question, { b: 'juga' })).toBe(true);
    expect(shouldSkipQuestion(question, { a: 'tetap', b: 'tetap' })).toBe(false);
  });
});

describe('isActive', () => {
  it('aktif = tampil DAN tidak dilewati', () => {
    const visibleNotSkipped = q({});
    expect(isActive(visibleNotSkipped, {})).toBe(true);

    const skipped = q({ skipConditions: [{ questionId: 'a', operator: 'equals', value: 'x' }] });
    expect(isActive(skipped, { a: 'x' })).toBe(false);

    const hidden = q({
      visibilityConditions: [{ questionId: 'a', operator: 'equals', value: 'x' }],
    });
    expect(isActive(hidden, { a: 'beda' })).toBe(false);
  });
});

describe('hideConditions (M8)', () => {
  const hideOnGt = q({
    hideConditions: [{ questionId: 'skor', operator: 'greater_than', value: '5' }],
  });

  it('menyembunyikan saat kondisi hide (operator non-equals) terpenuhi', () => {
    expect(isQuestionVisible(hideOnGt, { skor: '8' })).toBe(false);
    expect(isActive(hideOnGt, { skor: '8' })).toBe(false);
  });

  it('tetap tampil saat kondisi hide tidak terpenuhi', () => {
    expect(isQuestionVisible(hideOnGt, { skor: '3' })).toBe(true);
  });

  it('tetap tampil saat sumber kosong (hide tidak terpenuhi → tak tersembunyi)', () => {
    expect(isQuestionVisible(hideOnGt, {})).toBe(true);
  });

  it('hide menang atas show', () => {
    const both = q({
      visibilityConditions: [{ questionId: 'a', operator: 'equals', value: 'ya' }],
      hideConditions: [{ questionId: 'b', operator: 'equals', value: 'stop' }],
    });
    expect(isQuestionVisible(both, { a: 'ya', b: 'stop' })).toBe(false);
    expect(isQuestionVisible(both, { a: 'ya', b: 'lanjut' })).toBe(true);
  });
});
