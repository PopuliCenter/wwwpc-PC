import { getPosition } from '@/utils/geo';
import type { AnswerValue, SurveyFillData } from '@/types/survey';
import { isActive } from '@/utils/surveyBranching';

/**
 * Helper bersama pengisian survei — dipisah dari SurveyFillPage agar bisa
 * dipakai komponen halaman DAN hook (useAutoSave/useSurveySubmission) tanpa
 * impor melingkar.
 */

export const DEVICE_TYPE = /Mobi|Android|iPhone|iPad/i.test(
  typeof navigator !== 'undefined' ? navigator.userAgent : '',
)
  ? 'mobile'
  : 'desktop';

/**
 * Rekam koordinat GPS sekali (best-effort). Tidak pernah throw — resolve null
 * bila izin ditolak / tidak didukung / timeout, agar pengisian tetap berjalan.
 */
export function captureGeo(): Promise<{ lat: number; lng: number } | null> {
  // getPosition() menangani native (plugin + izin lokasi) maupun web.
  return getPosition({ enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }).then((p) =>
    p ? { lat: p.latitude, lng: p.longitude } : null,
  );
}

/** Apakah sebuah jawaban dianggap terisi (untuk validasi wajib). */
export function isAnswered(value: AnswerValue): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return false;
}

/** Serialisasi jawaban dengan kunci terurut — untuk deteksi perubahan (dirty). */
export function serializeAnswers(o: Record<string, AnswerValue>): string {
  return JSON.stringify(
    Object.keys(o)
      .sort()
      .reduce<Record<string, AnswerValue>>((acc, k) => {
        acc[k] = o[k];
        return acc;
      }, {}),
  );
}

/**
 * Posisi lanjut (checkpoint) saat pengisian dilanjutkan: langkah (wizard) atau
 * halaman (paginated) dari pertanyaan AKTIF pertama yang BELUM diisi. Bila semua
 * sudah diisi → langkah/halaman terakhir. Sadar-cabang (memakai isActive) agar
 * tak berhenti di pertanyaan yang sedang tersembunyi. Minimal 1.
 */
export function computeResumePage(
  survey: SurveyFillData,
  answers: Record<string, AnswerValue>,
): number {
  const active = survey.questions.filter((q) => isActive(q, answers));
  if (active.length === 0) return 1;
  const firstUnanswered = active.find((q) => !isAnswered(answers[q.id]));

  if (survey.formMode === 'wizard') {
    if (!firstUnanswered) return active.length; // semua terisi → langkah terakhir
    return active.indexOf(firstUnanswered) + 1;
  }
  // Paginated / scroll: pakai nomor halaman pertanyaan.
  if (!firstUnanswered) return Math.max(survey.totalPages, 1);
  return Math.max(firstUnanswered.page, 1);
}
