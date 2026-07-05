import { useEffect, useRef, useCallback, type MutableRefObject } from 'react';
import { api } from '@/services/api';
import type { AnswerValue, SurveyFillData } from '@/types/survey';
import { DEVICE_TYPE } from '../surveyFillHelpers';

type GeoRef = MutableRefObject<{ lat: number; lng: number } | null>;

/** Bentuk payload save-progress (draft) — sama untuk autosave berkala & flush. */
function buildProgressPayload(
  answers: Record<string, AnswerValue>,
  startGeo: { lat: number; lng: number } | null,
) {
  return {
    answers: Object.entries(answers).map(([questionId, value]) => ({ questionId, value })),
    deviceType: DEVICE_TYPE,
    ...(startGeo ? { startLatitude: startGeo.lat, startLongitude: startGeo.lng } : {}),
  };
}

/**
 * Auto-simpan progres pengisian (DRAFT — bukan submit final). Menyimpan tiap
 * 30 detik bila jawaban berubah, dan menyediakan `flushSave` untuk menyimpan
 * SEGERA saat pengguna meninggalkan halaman. Semua kegagalan diabaikan (best-
 * effort) agar tak mengganggu pengisian. Tidak menyentuh poin/submit.
 */
export function useAutoSave(params: {
  survey: SurveyFillData | null;
  answers: Record<string, AnswerValue>;
  /** Ref jawaban terbaru — dipakai flushSave agar tak tertinggal saat unmount. */
  answersRef: MutableRefObject<Record<string, AnswerValue>>;
  /** Bila sudah submit, flush tak perlu jalan. */
  submittedRef: MutableRefObject<boolean>;
  startGeoRef: GeoRef;
}): { flushSave: () => Promise<void> } {
  const { survey, answers, answersRef, submittedRef, startGeoRef } = params;
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastSavedRef = useRef<string>('');

  // Auto-save tiap 30 detik (hanya bila ada perubahan sejak simpan terakhir).
  useEffect(() => {
    if (!survey) return;
    timerRef.current = setInterval(() => {
      const snapshot = JSON.stringify(answers);
      if (snapshot !== lastSavedRef.current) {
        api
          .post(
            `/surveys/${survey.id}/responses/save-progress`,
            buildProgressPayload(answers, startGeoRef.current),
          )
          .catch(() => {
            /* silent auto-save failure */
          });
        lastSavedRef.current = snapshot;
      }
    }, 30000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [survey, answers, startGeoRef]);

  // Simpan progres SEGERA (mis. saat meninggalkan halaman) — pakai answersRef
  // agar selalu nilai terbaru. Best-effort, abaikan kegagalan.
  const flushSave = useCallback(async () => {
    if (!survey || submittedRef.current) return;
    try {
      await api.post(
        `/surveys/${survey.id}/responses/save-progress`,
        buildProgressPayload(answersRef.current, startGeoRef.current),
      );
    } catch {
      /* abaikan: auto-save berikutnya / antrean akan menyusul */
    }
  }, [survey, answersRef, submittedRef, startGeoRef]);

  return { flushSave };
}
