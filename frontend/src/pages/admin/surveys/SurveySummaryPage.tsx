import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Loader2, Users, CheckCircle2, Clock } from 'lucide-react';
import { api } from '@/services/api';

interface Bucket {
  label: string;
  count: number;
}
interface SummaryRespondent {
  fullName: string;
  gender: string | null;
  province: string | null;
  city: string | null;
  submittedAt: string | null;
}
interface Summary {
  id: string;
  title: string;
  status: string;
  maxRespondents: number | null;
  totalResponses: number;
  inProgress: number;
  byGender: Bucket[];
  byProvince: Bucket[];
  respondents: SummaryRespondent[];
}

const GENDER_LABEL: Record<string, string> = {
  male: 'Laki-laki',
  female: 'Perempuan',
  other: 'Lainnya',
};
const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('id-ID', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '—';

function BarList({ items, labelMap }: { items: Bucket[]; labelMap?: Record<string, string> }) {
  const max = Math.max(1, ...items.map((i) => i.count));
  if (items.length === 0) return <p className="text-sm text-gray-400">Belum ada data.</p>;
  return (
    <div className="space-y-2">
      {items.map((it) => (
        <div key={it.label} className="flex items-center gap-2">
          <span className="w-36 shrink-0 truncate text-xs text-gray-600" title={it.label}>
            {labelMap?.[it.label] ?? it.label}
          </span>
          <div className="h-4 flex-1 overflow-hidden rounded bg-gray-100">
            <div
              className="h-full rounded bg-primary-500"
              style={{ width: `${(it.count / max) * 100}%` }}
            />
          </div>
          <span className="w-8 shrink-0 text-right text-xs font-medium text-gray-700">
            {it.count}
          </span>
        </div>
      ))}
    </div>
  );
}

export function SurveySummaryPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    api
      .get<Summary>(`/surveys/${id}/summary`)
      .then((d) => active && setData(d))
      .catch(() => active && setError('Gagal memuat ringkasan survei.'))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [id]);

  if (loading)
    return (
      <div className="p-10 text-center text-gray-400">
        <Loader2 className="mx-auto h-6 w-6 animate-spin" />
      </div>
    );
  if (error || !data)
    return (
      <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
        {error || 'Tidak ada data.'}
      </div>
    );

  const quotaPct =
    data.maxRespondents && data.maxRespondents > 0
      ? Math.min(100, Math.round((data.totalResponses / data.maxRespondents) * 100))
      : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/admin/surveys')}
          className="text-sm text-gray-600 hover:text-gray-900"
        >
          ← Kembali
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ringkasan: {data.title}</h1>
          <p className="text-sm text-gray-500">Status: {data.status}</p>
        </div>
      </div>

      {/* Kartu metrik */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Respons selesai
          </div>
          <p className="mt-1 text-2xl font-bold text-gray-900">{data.totalResponses}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Clock className="h-4 w-4 text-amber-500" /> Sedang mengisi
          </div>
          <p className="mt-1 text-2xl font-bold text-gray-900">{data.inProgress}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4">
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <Users className="h-4 w-4 text-primary-600" /> Kuota
          </div>
          {data.maxRespondents && data.maxRespondents > 0 ? (
            <>
              <p className="mt-1 text-2xl font-bold text-gray-900">
                {data.totalResponses}
                <span className="text-base font-normal text-gray-400">/{data.maxRespondents}</span>
              </p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-primary-600"
                  style={{ width: `${quotaPct}%` }}
                />
              </div>
            </>
          ) : (
            <p className="mt-1 text-2xl font-bold text-gray-900">Tak terbatas</p>
          )}
        </div>
      </div>

      {/* Sebaran */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">Sebaran Jenis Kelamin</h2>
          <BarList items={data.byGender} labelMap={GENDER_LABEL} />
        </div>
        <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-900">Sebaran Provinsi</h2>
          <BarList items={data.byProvince} />
        </div>
      </div>

      {/* Daftar responden */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-gray-50 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3.5">Nama</th>
              <th className="px-4 py-3.5">Jenis Kelamin</th>
              <th className="px-4 py-3.5">Provinsi</th>
              <th className="px-4 py-3.5">Kota/Kab</th>
              <th className="px-4 py-3.5">Waktu Kirim</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.respondents.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-gray-400">
                  Belum ada respons.
                </td>
              </tr>
            )}
            {data.respondents.map((r, i) => (
              <tr key={i} className="hover:bg-gray-50">
                <td className="whitespace-nowrap px-4 py-3 font-medium text-gray-800">
                  {r.fullName}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-gray-600">
                  {r.gender ? (GENDER_LABEL[r.gender] ?? r.gender) : '—'}
                </td>
                <td className="whitespace-nowrap px-4 py-3 text-gray-600">{r.province ?? '—'}</td>
                <td className="whitespace-nowrap px-4 py-3 text-gray-600">{r.city ?? '—'}</td>
                <td className="whitespace-nowrap px-4 py-3 text-gray-500">
                  {fmtDate(r.submittedAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data.respondents.length >= 500 && (
        <p className="text-xs text-gray-400">Menampilkan 500 responden terbaru.</p>
      )}
    </div>
  );
}
