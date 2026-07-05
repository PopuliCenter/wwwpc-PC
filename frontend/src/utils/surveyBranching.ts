/**
 * Logika PERCABANGAN pengisian survei (murni, tanpa React) — menentukan apakah
 * sebuah kondisi terpenuhi, apakah pertanyaan tampil/dilewati, dan apakah
 * pertanyaan "aktif" (wajib divalidasi & ditampilkan).
 *
 * Diselaraskan dengan backend (condition-evaluator): jawaban KOSONG membuat
 * kondisi tidak terpenuhi untuk SEMUA operator; jawaban pilihan-ganda (array)
 * dicek dengan "termasuk", bukan digabung jadi string.
 *
 * Dipisah dari SurveyFillPage agar bisa diuji unit & dipakai ulang.
 */
import type { AnswerValue, Question, SkipCondition } from '@/types/survey';

export type AnswerMap = Record<string, AnswerValue>;

/** Apakah satu kondisi (skip/visibility) terpenuhi terhadap peta jawaban. */
export function evaluateCondition(answers: AnswerMap, condition: SkipCondition): boolean {
  const answer = answers[condition.questionId];
  if (answer === null || answer === undefined) return false;
  const cv = condition.value;
  const isArr = Array.isArray(answer);
  const arr = isArr ? (answer as string[]).map((v) => String(v)) : [];
  switch (condition.operator) {
    case 'equals':
      return isArr ? arr.includes(cv) : String(answer) === cv;
    case 'not_equals':
      return isArr ? !arr.includes(cv) : String(answer) !== cv;
    case 'contains':
      return isArr ? arr.includes(cv) : String(answer).includes(cv);
    case 'greater_than':
      return !isArr && Number(answer) > Number(cv);
    case 'less_than':
      return !isArr && Number(answer) < Number(cv);
    default:
      return false;
  }
}

/**
 * Pertanyaan tampil bila:
 *  - tak punya syarat 'show', ATAU SEMUA syarat show terpenuhi; DAN
 *  - tidak ada syarat 'hide' yang terpenuhi (hide menang atas show).
 * Aturan hide dievaluasi apa adanya (semua operator) — konsisten dgn server.
 */
export function isQuestionVisible(question: Question, answers: AnswerMap): boolean {
  const shown =
    !question.visibilityConditions?.length ||
    question.visibilityConditions.every((c) => evaluateCondition(answers, c));
  const hidden =
    !!question.hideConditions?.length &&
    question.hideConditions.some((c) => evaluateCondition(answers, c));
  return shown && !hidden;
}

/** Pertanyaan dilewati bila punya syarat skip DAN salah satunya terpenuhi. */
export function shouldSkipQuestion(question: Question, answers: AnswerMap): boolean {
  return (
    !!question.skipConditions?.length &&
    question.skipConditions.some((c) => evaluateCondition(answers, c))
  );
}

/** Pertanyaan "aktif" = tampil dan tidak dilewati (dasar validasi & tampilan). */
export function isActive(question: Question, answers: AnswerMap): boolean {
  return isQuestionVisible(question, answers) && !shouldSkipQuestion(question, answers);
}
