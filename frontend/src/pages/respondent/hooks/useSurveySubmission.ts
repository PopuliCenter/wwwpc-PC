import { useState, useCallback, type MutableRefObject } from 'react';
import { api } from '@/services/api';
import { queueAdd, makeLocalId } from '@/utils/offlineQueue';
import type { AnswerValue, Question, SurveyFillData } from '@/types/survey';
import { DEVICE_TYPE, captureGeo, isAnswered } from '../surveyFillHelpers';

type GeoRef = MutableRefObject<{ lat: number; lng: number } | null>;

interface UseSurveySubmissionParams {
  survey: SurveyFillData | null;
  answers: Record<string, AnswerValue>;
  answersToArray: () => { questionId: string; value: AnswerValue }[];
  isActive: (q: Question) => boolean;
  currentPage: number;
  destinationNumber: string;
  rewardType: string;
  online: boolean;
  sync: { refresh: () => Promise<void> };
  startGeoRef: GeoRef;
  // State UI bersama tetap dimiliki komponen (dipakai luas di render).
  setError: (msg: string | null) => void;
  setMissingIds: (ids: Set<string>) => void;
  setCurrentPage: (page: number) => void;
}

interface UseSurveySubmissionResult {
  submit: () => Promise<void>;
  submitting: boolean;
  submitted: boolean;
  earnedPoints: number;
  queuedOffline: boolean;
}

/**
 * Alur SUBMIT final survei (jalur bernilai-uang: memberi poin). Memiliki state
 * submitting/submitted/earnedPoints/queuedOffline; state UI bersama (error,
 * missingIds, currentPage) tetap di komponen dan diteruskan sebagai setter.
 *
 * Perilaku dipertahankan persis dari implementasi sebelumnya:
 *  - validasi wajib sisi-klien (sadar-cabang via isActive) + lompat ke halaman/
 *    langkah pertanyaan wajib pertama;
 *  - reward manual butuh nomor tujuan;
 *  - online → POST submit (idempoten via clientSubmissionId); offline → antrikan.
 */
export function useSurveySubmission(params: UseSurveySubmissionParams): UseSurveySubmissionResult {
  const {
    survey,
    answers,
    answersToArray,
    isActive,
    currentPage,
    destinationNumber,
    rewardType,
    online,
    sync,
    startGeoRef,
    setError,
    setMissingIds,
    setCurrentPage,
  } = params;

  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [earnedPoints, setEarnedPoints] = useState<number>(0);
  const [queuedOffline, setQueuedOffline] = useState(false);

  const submit = useCallback(async () => {
    if (!survey) return;

    // Client-side required validation mirrors the server's checks.
    const missing = survey.questions
      .filter((q) => q.required && isActive(q) && !isAnswered(answers[q.id]))
      .map((q) => q.id);

    if (missing.length > 0) {
      setMissingIds(new Set(missing));
      if (survey.formMode === 'wizard') {
        // Lompat ke langkah (indeks pertanyaan aktif) yang memuat pertanyaan wajib pertama.
        const active = survey.questions.filter(isActive);
        const stepIdx = active.findIndex((q) => q.id === missing[0]);
        setCurrentPage(stepIdx >= 0 ? stepIdx + 1 : 1);
      } else {
        const firstPage = survey.questions.find((q) => q.id === missing[0])?.page ?? currentPage;
        setCurrentPage(firstPage);
      }
      setError(`Masih ada ${missing.length} pertanyaan wajib yang belum diisi.`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    if (survey.rewardMode === 'manual' && !destinationNumber) {
      setError('Mohon isi nomor tujuan reward.');
      return;
    }

    setError(null);
    setMissingIds(new Set());
    setSubmitting(true);
    try {
      // Rekam lokasi akhir (best-effort) saat submit — hanya bila diaktifkan.
      const endGeo = survey.captureGps ? await captureGeo() : null;
      const localId = makeLocalId();
      const payload = {
        answers: answersToArray(),
        deviceType: DEVICE_TYPE,
        clientSubmissionId: localId,
        ...(startGeoRef.current
          ? {
              startLatitude: startGeoRef.current.lat,
              startLongitude: startGeoRef.current.lng,
            }
          : {}),
        ...(endGeo ? { endLatitude: endGeo.lat, endLongitude: endGeo.lng } : {}),
        ...(survey.rewardMode === 'manual' && destinationNumber
          ? { destinationNumber, rewardType }
          : {}),
      };

      if (online) {
        const result = await api.post<{ pointsEarned?: number }>(
          `/surveys/${survey.id}/responses/submit`,
          payload,
        );
        setEarnedPoints(result?.pointsEarned ?? survey.rewardPoints ?? 0);
        setSubmitted(true);
      } else {
        // Offline: antrikan submit; media (local-media://) di-resolve saat sync.
        await queueAdd({
          localId,
          surveyId: survey.id,
          surveyTitle: survey.title,
          submitPath: `/surveys/${survey.id}/responses/submit`,
          uploadPath: `/surveys/${survey.id}/responses/upload`,
          payload,
          createdAt: Date.now(),
          attempts: 0,
        });
        await sync.refresh();
        setQueuedOffline(true);
        setSubmitted(true);
      }
    } catch (err: unknown) {
      const e = err as { message?: string; errors?: string[] };
      setError(e.errors?.[0] || e.message || 'Gagal mengirim jawaban. Silakan coba lagi.');
    } finally {
      setSubmitting(false);
    }
  }, [
    survey,
    answers,
    answersToArray,
    isActive,
    currentPage,
    destinationNumber,
    rewardType,
    online,
    sync,
    startGeoRef,
    setError,
    setMissingIds,
    setCurrentPage,
  ]);

  return { submit, submitting, submitted, earnedPoints, queuedOffline };
}
