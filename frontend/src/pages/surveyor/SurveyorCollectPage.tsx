import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle2, MapPin, Send, WifiOff, RefreshCw, CloudUpload } from 'lucide-react';
import { api } from '@/services/api';
import { Card } from '@/components/common/Card';
import { Button } from '@/components/common/Button';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { useOfflineSync } from '@/hooks/useOfflineSync';
import { MediaUploadProvider, type UploadMediaFn } from '@/contexts/MediaUploadContext';
import {
  cachePut,
  cacheGet,
  queueAdd,
  makeLocalId,
  mediaPut,
  LOCAL_MEDIA_PREFIX,
} from '@/utils/offlineQueue';
import {
  QuestionRenderer,
  isAnswered,
  captureGeo,
  DEVICE_TYPE,
  type Question,
  type AnswerValue,
} from '../respondent/SurveyFillPage';

interface SurveyorFillData {
  id: string;
  title: string;
  description: string;
  questions: Question[];
}

interface NumberItem {
  number: string;
  used: boolean;
}

type Operator = 'equals' | 'not_equals' | 'contains' | 'greater_than' | 'less_than';
interface Condition {
  questionId: string;
  operator: Operator;
  value: string;
}

export function SurveyorCollectPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<SurveyorFillData | null>(null);
  const [numbers, setNumbers] = useState<NumberItem[]>([]);
  const [selectedNumber, setSelectedNumber] = useState('');
  const [answers, setAnswers] = useState<Record<string, AnswerValue>>({});
  const [missingIds, setMissingIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collectedCount, setCollectedCount] = useState(0);
  const startGeoRef = useRef<{ lat: number; lng: number } | null>(null);
  const online = useOnlineStatus();
  const sync = useOfflineSync();

  // Upload media: online → endpoint surveyor; offline → simpan blob lokal,
  // kembalikan referensi local-media:// yang di-resolve saat sinkron.
  const uploadMedia = useCallback<UploadMediaFn>(
    async (file, sId, filename = 'upload') => {
      if (navigator.onLine) {
        const fd = new FormData();
        fd.append('file', file, filename);
        const r = await api.upload<{ key: string }>(
          `/surveyor/surveys/${sId}/responses/upload`,
          fd,
        );
        return r.key;
      }
      const mediaId = makeLocalId();
      await mediaPut({ id: mediaId, blob: file, filename });
      return `${LOCAL_MEDIA_PREFIX}${mediaId}`;
    },
    [],
  );

  const loadNumbers = useCallback(async () => {
    const list = await api.get<NumberItem[]>(`/surveyor/surveys/${id}/numbers`);
    setNumbers(list);
    void cachePut(`numbers:${id}`, list);
    return list;
  }, [id]);

  useEffect(() => {
    const init = async () => {
      try {
        const [fill, list] = await Promise.all([
          api.get<SurveyorFillData>(`/surveyor/surveys/${id}/fill`),
          api.get<NumberItem[]>(`/surveyor/surveys/${id}/numbers`),
        ]);
        setData(fill);
        setNumbers(list);
        // Simpan ke cache offline agar bisa dibuka tanpa internet nanti.
        void cachePut(`fill:${id}`, fill);
        void cachePut(`numbers:${id}`, list);
        const firstAvailable = list.find((n) => !n.used);
        if (firstAvailable) setSelectedNumber(firstAvailable.number);
      } catch {
        // Offline / gagal jaringan → coba muat dari cache IndexedDB.
        const [cachedFill, cachedNumbers] = await Promise.all([
          cacheGet<SurveyorFillData>(`fill:${id}`),
          cacheGet<NumberItem[]>(`numbers:${id}`),
        ]);
        if (cachedFill) {
          setData(cachedFill);
          setNumbers(cachedNumbers ?? []);
          const firstAvailable = (cachedNumbers ?? []).find((n) => !n.used);
          if (firstAvailable) setSelectedNumber(firstAvailable.number);
        } else {
          setError('Gagal memuat survei dan tidak ada salinan offline.');
        }
      } finally {
        setLoading(false);
      }
    };
    void init();
  }, [id]);

  useEffect(() => {
    void captureGeo().then((geo) => {
      if (geo) startGeoRef.current = geo;
    });
  }, []);

  const evaluateCondition = useCallback(
    (c: Condition): boolean => {
      const a = answers[c.questionId];
      const s = Array.isArray(a) ? a.join(',') : String(a ?? '');
      switch (c.operator) {
        case 'equals':
          return s === c.value;
        case 'not_equals':
          return s !== c.value;
        case 'contains':
          return s.includes(c.value);
        case 'greater_than':
          return Number(s) > Number(c.value);
        case 'less_than':
          return Number(s) < Number(c.value);
        default:
          return false;
      }
    },
    [answers],
  );

  const isActive = useCallback(
    (q: Question): boolean => {
      const visible =
        !q.visibilityConditions?.length ||
        q.visibilityConditions.every((c) => evaluateCondition(c as Condition));
      const skipped =
        !!q.skipConditions?.length &&
        q.skipConditions.some((c) => evaluateCondition(c as Condition));
      return visible && !skipped;
    },
    [evaluateCondition],
  );

  const activeQuestions = useMemo(
    () => (data ? data.questions.filter(isActive) : []),
    [data, isActive],
  );

  const availableNumbers = numbers.filter((n) => !n.used);

  const handleAnswerChange = (questionId: string, value: AnswerValue) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }));
    if (missingIds.has(questionId) && isAnswered(value)) {
      setMissingIds((prev) => {
        const next = new Set(prev);
        next.delete(questionId);
        return next;
      });
    }
  };

  const resetForm = (list: NumberItem[]) => {
    setAnswers({});
    setMissingIds(new Set());
    const next = list.find((n) => !n.used);
    setSelectedNumber(next ? next.number : '');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async () => {
    if (!data) return;
    if (!selectedNumber) {
      setError('Pilih nomor kuesioner terlebih dahulu.');
      return;
    }

    const missing = data.questions
      .filter((q) => q.required && isActive(q) && !isAnswered(answers[q.id]))
      .map((q) => q.id);
    if (missing.length > 0) {
      setMissingIds(new Set(missing));
      setError(`Masih ada ${missing.length} pertanyaan wajib yang belum diisi.`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setError(null);
    setSubmitting(true);
    try {
      const endGeo = await captureGeo();
      // clientSubmissionId = localId → server idempoten saat sync mengirim ulang.
      const localId = makeLocalId();
      const payload = {
        answers: Object.entries(answers).map(([questionId, value]) => ({ questionId, value })),
        questionnaireNumber: selectedNumber,
        deviceType: DEVICE_TYPE,
        clientSubmissionId: localId,
        ...(startGeoRef.current
          ? { startLatitude: startGeoRef.current.lat, startLongitude: startGeoRef.current.lng }
          : {}),
        ...(endGeo ? { endLatitude: endGeo.lat, endLongitude: endGeo.lng } : {}),
      };

      if (online) {
        await api.post(`/surveyor/surveys/${data.id}/responses`, payload);
        setCollectedCount((c) => c + 1);
        const list = await loadNumbers();
        resetForm(list);
      } else {
        // Offline: simpan ke antrian IndexedDB & tandai nomor terpakai lokal.
        await queueAdd({
          localId,
          surveyId: data.id,
          surveyTitle: data.title,
          submitPath: `/surveyor/surveys/${data.id}/responses`,
          uploadPath: `/surveyor/surveys/${data.id}/responses/upload`,
          payload,
          createdAt: Date.now(),
          attempts: 0,
        });
        const nextNumbers = numbers.map((n) =>
          n.number === selectedNumber ? { ...n, used: true } : n,
        );
        setNumbers(nextNumbers);
        void cachePut(`numbers:${data.id}`, nextNumbers);
        setCollectedCount((c) => c + 1);
        await sync.refresh();
        resetForm(nextNumbers);
      }
    } catch (err: unknown) {
      const e = err as { message?: string; errors?: string[] };
      setError(e.errors?.[0] || e.message || 'Gagal mengirim kuesioner.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl">
        <Card className="animate-pulse">
          <div className="mb-3 h-5 w-1/2 rounded bg-gray-200" />
          <div className="h-4 w-3/4 rounded bg-gray-200" />
        </Card>
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="mx-auto max-w-3xl">
        <Card className="border-red-200 bg-red-50 text-red-700">{error}</Card>
      </div>
    );
  }

  if (!data) return null;

  return (
    <MediaUploadProvider value={uploadMedia}>
    <div className="mx-auto max-w-3xl space-y-5">
      <Card>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-lg font-bold text-gray-900">{data.title}</h1>
            <p className="text-sm text-gray-600">
              Terkumpul sesi ini: <span className="font-semibold">{collectedCount}</span>
            </p>
          </div>
          <Button variant="secondary" onClick={() => navigate('/surveyor/surveys')}>
            Selesai
          </Button>
        </div>

        <div className="mt-4">
          <label className="mb-1 block text-sm font-medium text-gray-700">
            Nomor Kuesioner <span className="text-red-500">*</span>
          </label>
          {availableNumbers.length > 0 ? (
            <select
              value={selectedNumber}
              onChange={(e) => setSelectedNumber(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary-500"
            >
              {availableNumbers.map((n) => (
                <option key={n.number} value={n.number}>
                  {n.number}
                </option>
              ))}
            </select>
          ) : (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-700 ring-1 ring-amber-100">
              Semua nomor kuesioner Anda sudah terpakai. Hubungi admin untuk alokasi tambahan.
            </p>
          )}
        </div>
      </Card>

      {/* Status offline & antrian sinkron */}
      {(!online || sync.queuedCount > 0) && (
        <div
          className={`flex flex-wrap items-center justify-between gap-2 rounded-lg p-3 text-sm ring-1 ${
            !online
              ? 'bg-amber-50 text-amber-800 ring-amber-100'
              : 'bg-primary-50 text-primary-700 ring-primary-100'
          }`}
        >
          <span className="inline-flex items-center gap-2">
            {!online ? (
              <>
                <WifiOff className="h-4 w-4" /> Mode offline — respons disimpan & dikirim saat online
              </>
            ) : (
              <>
                <CloudUpload className="h-4 w-4" /> {sync.queuedCount} respons menunggu sinkron
              </>
            )}
          </span>
          {sync.queuedCount > 0 && (
            <button
              type="button"
              onClick={() => sync.syncNow()}
              disabled={!online || sync.syncing}
              className="inline-flex items-center gap-1.5 rounded-md bg-white px-3 py-1 font-medium text-gray-700 shadow-sm ring-1 ring-gray-200 hover:bg-gray-50 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${sync.syncing ? 'animate-spin' : ''}`} />
              {sync.syncing ? 'Menyinkron...' : 'Sinkron sekarang'}
            </button>
          )}
        </div>
      )}

      {!online && data.questions.some((q) => ['photo', 'audio', 'signature', 'file_upload'].includes(q.type)) && (
        <div className="rounded-lg bg-gray-50 p-3 text-xs text-gray-500 ring-1 ring-gray-100">
          Media (foto, audio, tanda tangan, berkas) disimpan di perangkat dan akan diunggah otomatis saat sinkron.
        </div>
      )}

      {sync.lastResult && (
        <div className="rounded-lg bg-emerald-50 p-2.5 text-xs text-emerald-700 ring-1 ring-emerald-100">
          {sync.lastResult}
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {activeQuestions.map((question, idx) => {
        const invalid = missingIds.has(question.id);
        return (
          <Card key={question.id} className={invalid ? 'border-red-300 ring-1 ring-red-200' : ''}>
            <div className="mb-4 flex items-start gap-3">
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xs font-semibold text-primary-700">
                {idx + 1}
              </span>
              <div className="flex-1">
                <p className="text-base font-semibold leading-snug text-gray-900">
                  {question.text}
                  {question.required && <span className="ml-1 text-red-500">*</span>}
                </p>
                {question.description && (
                  <p className="mt-1 text-xs text-gray-500">{question.description}</p>
                )}
              </div>
            </div>
            <QuestionRenderer
              question={question}
              value={answers[question.id] ?? null}
              onChange={(val) => handleAnswerChange(question.id, val)}
              surveyId={data.id}
              invalid={invalid}
            />
          </Card>
        );
      })}

      <div className="flex items-center justify-between gap-3 pb-2">
        <span className="inline-flex items-center gap-1.5 text-xs text-gray-500">
          <MapPin className="h-3.5 w-3.5" /> Lokasi direkam otomatis
        </span>
        <Button
          onClick={handleSubmit}
          isLoading={submitting}
          disabled={availableNumbers.length === 0}
        >
          <Send className="h-4 w-4" /> {submitting ? 'Menyimpan...' : 'Simpan & Kuesioner Berikutnya'}
        </Button>
      </div>

      {collectedCount > 0 && !submitting && (
        <div className="flex items-center justify-center gap-2 text-sm text-emerald-600">
          <CheckCircle2 className="h-4 w-4" /> {collectedCount} kuesioner berhasil disimpan
        </div>
      )}
    </div>
    </MediaUploadProvider>
  );
}
