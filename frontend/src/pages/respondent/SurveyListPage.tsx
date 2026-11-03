import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronDown, RefreshCw } from 'lucide-react';
import { format } from 'date-fns';
import { id as localeId } from 'date-fns/locale';
import { api } from '@/services/api';
import { Button, useTapFeedback } from '@/components/common/Button';
import { IconButton } from '@/components/common/IconButton';
import { Notice } from '@/components/common/Notice';
import { Skeleton, SurveyRowSkeleton } from '@/components/common/Skeleton';

interface AvailableSurvey {
  id: string;
  title: string;
  description: string;
  deadline: string;
  estimatedTime: number;
  rewardMode: 'auto_point' | 'manual';
  rewardPoints?: number;
  rewardDescription?: string;
  questionCount: number;
  completed?: boolean;
  startsAt?: string | null;
  upcoming?: boolean;
}

// Daftar, bukan galeri kartu: di HP lebar penuh menempel tepi layar, dari sm panel bertepi.
const listPanelCls =
  '-mx-4 divide-y divide-gray-100 border-y border-gray-200 bg-white sm:mx-0 sm:rounded-xl sm:border';

/** Teks nilai survei: poin, atau isi teks reward manual; kosong bila tidak ada. */
function rewardLabel(survey: AvailableSurvey): string | null {
  return survey.rewardMode === 'auto_point' && survey.rewardPoints
    ? `${survey.rewardPoints.toLocaleString('id-ID')} poin`
    : survey.rewardDescription || null;
}

/** Baris survei tersedia — ringkas, detail bisa dibuka/tutup. */
function SurveyRow({ survey, primary }: { survey: AvailableSurvey; primary: boolean }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const reward = rewardLabel(survey);
  return (
    <li className="p-4">
      <h2 className="text-base font-medium text-gray-900">{survey.title}</h2>

      {/* Meta ringkas — selalu terlihat */}
      <p className="mt-1 text-xs tabular-nums text-gray-600">
        ± {survey.estimatedTime} menit · {survey.questionCount} pertanyaan
        {reward && (
          <>
            {' · '}
            <span className="font-medium text-gray-800">{reward}</span>
          </>
        )}
      </p>

      {/* Detail — disembunyikan, bisa dibuka */}
      {open && (
        <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
          {survey.description && (
            <p className="text-sm leading-relaxed text-gray-600">{survey.description}</p>
          )}
          <p className="text-xs tabular-nums text-gray-600">
            Ditutup {format(new Date(survey.deadline), 'd MMM yyyy', { locale: localeId })}
          </p>
        </div>
      )}

      <div className="mt-3 flex items-center gap-2">
        <Button
          type="button"
          variant={primary ? 'primary' : 'secondary'}
          className="flex-1"
          onClick={() => navigate(`/surveys/${survey.id}/fill`)}
        >
          Isi survei
        </Button>
        <Button
          type="button"
          variant="ghost"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          Detail
          <ChevronDown
            className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`}
            strokeWidth={1.75}
            aria-hidden="true"
          />
        </Button>
      </div>
    </li>
  );
}

/** Baris survei "akan dibuka" — belum bisa diisi, jadi tanpa tombol. */
function UpcomingRow({ survey }: { survey: AvailableSurvey }) {
  const reward = rewardLabel(survey);
  const opensAt = survey.startsAt
    ? `Dibuka ${format(new Date(survey.startsAt), 'd MMM, HH.mm', { locale: localeId })}`
    : null;
  return (
    <li className="p-4">
      <h3 className="text-base font-medium text-gray-700">{survey.title}</h3>
      {(opensAt || reward) && (
        <p className="mt-1 text-xs tabular-nums text-gray-600">
          {opensAt}
          {opensAt && reward && ' · '}
          {reward && <span className="font-medium text-gray-800">{reward}</span>}
        </p>
      )}
    </li>
  );
}

export function SurveyListPage() {
  const tap = useTapFeedback();
  const [surveys, setSurveys] = useState<AvailableSurvey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);

  const fetchSurveys = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await api.get<AvailableSurvey[]>('/surveys/available');
      setSurveys(Array.isArray(result) ? result : []);
    } catch {
      setError('Gagal memuat daftar survei');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSurveys();
  }, [fetchSurveys]);

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="space-y-2">
          <Skeleton className="h-7 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
        <div className={listPanelCls}>
          {[1, 2, 3].map((i) => (
            <SurveyRowSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-2xl font-bold text-gray-900">Survei terbuka</h1>
        <Notice
          tone="danger"
          role="alert"
          action={
            <Button type="button" variant="secondary" size="sm" onClick={() => void fetchSurveys()}>
              <RefreshCw className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" /> Coba lagi
            </Button>
          }
        >
          {error}
        </Notice>
      </div>
    );
  }

  const available = surveys.filter((s) => !s.completed && !s.upcoming);
  const upcoming = surveys.filter((s) => !s.completed && s.upcoming);
  const completed = surveys.filter((s) => s.completed);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900">Survei terbuka</h1>
            <p className="mt-1 text-xs tabular-nums text-gray-600">
              {available.length} tersedia · {completed.length} selesai
            </p>
          </div>
          <IconButton aria-label="Muat ulang daftar survei" onClick={() => void fetchSurveys()}>
            <RefreshCw className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" />
          </IconButton>
        </div>

        {/* Tersedia */}
        {available.length > 0 ? (
          <ul className={listPanelCls}>
            {available.map((s, i) => (
              <SurveyRow key={s.id} survey={s} primary={i === 0} />
            ))}
          </ul>
        ) : (
          <div className={listPanelCls}>
            <div className="p-4">
              <p className="text-sm text-gray-800">Belum ada survei baru untuk Anda saat ini.</p>
              <p className="mt-1 text-sm text-gray-600">Silakan cek kembali nanti.</p>
            </div>
          </div>
        )}
      </div>

      {/* Akan dibuka */}
      {upcoming.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-gray-700">Akan dibuka</h2>
          <ul className={listPanelCls}>
            {upcoming.map((s) => (
              <UpcomingRow key={s.id} survey={s} />
            ))}
          </ul>
        </section>
      )}

      {/* Sudah diisi — terlipat, bisa dibuka */}
      {completed.length > 0 && (
        <section className="space-y-2">
          <h2>
            <button
              type="button"
              aria-expanded={showDone}
              onClick={(e) => {
                tap(e);
                setShowDone((v) => !v);
              }}
              className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg text-sm font-semibold text-gray-600 transition-colors hover:text-gray-900"
            >
              <span className="flex items-center gap-2 tabular-nums">
                <Check
                  className="h-4 w-4 shrink-0 text-success-fg"
                  strokeWidth={1.75}
                  aria-hidden="true"
                />
                Selesai ({completed.length})
              </span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 transition-transform ${showDone ? 'rotate-180' : ''}`}
                strokeWidth={1.75}
                aria-hidden="true"
              />
            </button>
          </h2>
          {showDone && (
            <ul className={listPanelCls}>
              {completed.map((s) => (
                <li key={s.id} className="truncate px-4 py-3 text-sm text-gray-700">
                  {s.title}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
