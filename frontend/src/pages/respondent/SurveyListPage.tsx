import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Clock,
  HelpCircle,
  CalendarDays,
  Gift,
  RefreshCw,
  ChevronDown,
  CheckCircle2,
  Hourglass,
  ClipboardList,
  Coins,
} from 'lucide-react';
import { api } from '@/services/api';
import { useAuthStore } from '@/stores/auth.store';
import { usePointsStore } from '@/stores/points.store';
import { Skeleton, SurveyCardSkeleton } from '@/components/common/Skeleton';
import { format } from 'date-fns';

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

function RewardBadge({ survey }: { survey: AvailableSurvey }) {
  const label =
    survey.rewardMode === 'auto_point' && survey.rewardPoints
      ? `${survey.rewardPoints.toLocaleString('id-ID')} poin`
      : survey.rewardDescription || null;
  if (!label) return null;
  return (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 ring-1 ring-inset ring-amber-200">
      <Gift className="h-3.5 w-3.5" /> {label}
    </span>
  );
}

/** Kartu survei tersedia — ringkas, detail bisa dibuka/tutup. */
function SurveyCard({ survey }: { survey: AvailableSurvey }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold leading-snug text-gray-900">{survey.title}</h3>
        <RewardBadge survey={survey} />
      </div>

      {/* Meta ringkas — selalu terlihat */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-gray-500">
        <span className="inline-flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" /> ±{survey.estimatedTime} menit
        </span>
        <span className="inline-flex items-center gap-1.5">
          <HelpCircle className="h-3.5 w-3.5" /> {survey.questionCount} pertanyaan
        </span>
      </div>

      {/* Detail — disembunyikan, bisa dibuka */}
      {open && (
        <div className="mt-3 space-y-2 border-t border-gray-100 pt-3">
          {survey.description && (
            <p className="text-sm leading-relaxed text-gray-600">{survey.description}</p>
          )}
          <div className="inline-flex items-center gap-1.5 text-xs text-gray-500">
            <CalendarDays className="h-3.5 w-3.5" />
            Ditutup: {format(new Date(survey.deadline), 'dd MMM yyyy')}
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        <button
          onClick={() => navigate(`/surveys/${survey.id}/fill`)}
          className="flex-1 rounded-xl bg-primary-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700"
        >
          Isi Survei
        </button>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 rounded-xl border border-gray-200 px-3 py-2.5 text-xs font-medium text-gray-600 hover:bg-gray-50"
        >
          Detail
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
        </button>
      </div>
    </div>
  );
}

/** Kartu survei "akan datang" — belum bisa diisi. */
function UpcomingCard({ survey }: { survey: AvailableSurvey }) {
  return (
    <div className="flex flex-col rounded-2xl border border-dashed border-gray-300 bg-gray-50/60 p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold leading-snug text-gray-700">{survey.title}</h3>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-semibold text-indigo-600 ring-1 ring-inset ring-indigo-200">
          <Hourglass className="h-3.5 w-3.5" /> Segera
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-gray-500">
        <RewardBadge survey={survey} />
        {survey.startsAt && (
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays className="h-3.5 w-3.5" />
            Dibuka {format(new Date(survey.startsAt), 'dd MMM yyyy, HH:mm')}
          </span>
        )}
      </div>
      <button
        disabled
        className="mt-4 w-full cursor-not-allowed rounded-xl bg-gray-100 py-2.5 text-sm font-semibold text-gray-400"
      >
        Belum dibuka
      </button>
    </div>
  );
}

export function SurveyListPage() {
  const [surveys, setSurveys] = useState<AvailableSurvey[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  const { user } = useAuthStore();
  const points = usePointsStore((s) => s.available);
  const firstName = user?.fullName?.trim().split(' ')[0] ?? '';

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
      <div className="space-y-4">
        <Skeleton className="h-7 w-48" />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <SurveyCardSkeleton key={i} />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-gray-900">Survei</h1>
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-700">
          <p>{error}</p>
          <button
            onClick={() => void fetchSurveys()}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Coba lagi
          </button>
        </div>
      </div>
    );
  }

  const available = surveys.filter((s) => !s.completed && !s.upcoming);
  const upcoming = surveys.filter((s) => !s.completed && s.upcoming);
  const completed = surveys.filter((s) => s.completed);

  return (
    <div className="space-y-7">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Halo, {firstName || 'Responden'} 👋</h1>
          <p className="mt-1 text-sm text-gray-500">
            {available.length > 0
              ? `Ada ${available.length} survei menunggu untuk diisi. Setiap survei berhadiah poin.`
              : 'Belum ada survei baru untuk Anda saat ini. Cek lagi nanti, ya.'}
          </p>
        </div>
        <button
          onClick={() => void fetchSurveys()}
          aria-label="Muat ulang daftar survei"
          title="Muat ulang"
          className="shrink-0 rounded-lg border border-gray-200 p-2.5 text-gray-500 hover:bg-gray-50 hover:text-gray-700"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </div>

      {/* Kartu statistik */}
      <div className="grid grid-cols-3 gap-3">
        {[
          {
            icon: Coins,
            label: 'Poin Saya',
            value: points == null ? '—' : points.toLocaleString('id-ID'),
            ring: 'ring-amber-100',
            bg: 'bg-amber-50',
            text: 'text-amber-600',
          },
          {
            icon: ClipboardList,
            label: 'Tersedia',
            value: available.length,
            ring: 'ring-indigo-100',
            bg: 'bg-indigo-50',
            text: 'text-indigo-600',
          },
          {
            icon: CheckCircle2,
            label: 'Selesai',
            value: completed.length,
            ring: 'ring-emerald-100',
            bg: 'bg-emerald-50',
            text: 'text-emerald-600',
          },
        ].map(({ icon: Icon, label, value, ring, bg, text }) => (
          <div
            key={label}
            className={`rounded-2xl border border-gray-100 bg-white p-3 text-center shadow-sm ring-1 ${ring}`}
          >
            <span
              className={`mx-auto mb-1.5 flex h-9 w-9 items-center justify-center rounded-full ${bg} ${text}`}
            >
              <Icon className="h-4 w-4" />
            </span>
            <p className="text-lg font-bold leading-none text-gray-900">{value}</p>
            <p className="mt-1 text-[11px] font-medium text-gray-500">{label}</p>
          </div>
        ))}
      </div>

      {/* Tersedia */}
      {available.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <ClipboardList className="h-4 w-4 text-primary-600" /> Survei tersedia
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {available.map((s) => (
              <SurveyCard key={s.id} survey={s} />
            ))}
          </div>
        </section>
      )}

      {/* Akan datang */}
      {upcoming.length > 0 && (
        <section className="space-y-3">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-700">
            <Hourglass className="h-4 w-4 text-indigo-500" /> Akan datang
          </h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {upcoming.map((s) => (
              <UpcomingCard key={s.id} survey={s} />
            ))}
          </div>
        </section>
      )}

      {/* Kosong total */}
      {available.length === 0 && upcoming.length === 0 && completed.length === 0 && (
        <div className="rounded-2xl border border-gray-200 bg-white p-10 text-center">
          <ClipboardList className="mx-auto mb-3 h-10 w-10 text-gray-300" />
          <p className="text-gray-600">Belum ada survei yang tersedia saat ini.</p>
          <p className="mt-1 text-sm text-gray-400">Silakan cek kembali nanti.</p>
        </div>
      )}

      {/* Sudah diisi — disembunyikan, bisa dibuka */}
      {completed.length > 0 && (
        <section className="space-y-3">
          <button
            type="button"
            onClick={() => setShowDone((v) => !v)}
            className="flex w-full items-center justify-between rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <span className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              Survei sudah diisi ({completed.length})
            </span>
            <ChevronDown
              className={`h-4 w-4 text-gray-400 transition-transform ${showDone ? 'rotate-180' : ''}`}
            />
          </button>
          {showDone && (
            <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
              {completed.map((s) => (
                <li key={s.id} className="flex items-center gap-3 px-4 py-3">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                  <span className="flex-1 truncate text-sm text-gray-600">{s.title}</span>
                  <span className="shrink-0 text-xs text-gray-400">Selesai</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
