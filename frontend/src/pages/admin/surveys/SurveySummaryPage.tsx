import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { api } from '@/services/api';
import { BarList } from '@/components/common/BarList';
import { Button } from '@/components/common/Button';
import { thBaseCls, tdBaseCls } from '@/components/common/tableStyles';
import { Card } from '@/components/common/Card';
import { Notice } from '@/components/common/Notice';
import { Skeleton, TableSkeleton } from '@/components/common/Skeleton';
import { SurveyStatusBadge } from './SurveyStatusBadge';

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

// Tabel gaya laporan: garis navy di bawah kepala, tanpa latar.
const thCls = `${thBaseCls} py-2.5 text-left`;
const tdCls = `${tdBaseCls} whitespace-nowrap py-3`;

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
      <div className="space-y-6" aria-busy="true">
        <Skeleton className="h-8 w-2/3 max-w-md" />
        <Card flush className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="space-y-2">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-9 w-20" />
            </div>
          ))}
        </Card>
        <Card flush className="overflow-hidden">
          <TableSkeleton rows={5} cols={5} />
        </Card>
      </div>
    );
  if (error || !data)
    return (
      <Notice tone="danger" role="alert">
        {error || 'Tidak ada data.'}
      </Notice>
    );

  const quotaPct =
    data.maxRespondents && data.maxRespondents > 0
      ? Math.min(100, Math.round((data.totalResponses / data.maxRespondents) * 100))
      : null;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0"
          onClick={() => navigate('/admin/surveys')}
        >
          <ArrowLeft className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" /> Kembali
        </Button>
        <div className="min-w-0">
          <h1 className="truncate text-2xl text-gray-900" title={data.title}>
            Ringkasan: {data.title}
          </h1>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-gray-600">
            Status: <SurveyStatusBadge status={data.status} />
          </p>
        </div>
      </div>

      {/* Angka utama: satu panel dibagi garis, bukan tiga kartu */}
      <Card
        flush
        className="grid grid-cols-1 divide-y divide-gray-200 sm:grid-cols-3 sm:divide-x sm:divide-y-0"
      >
        <div className="p-4">
          <p className="text-xs text-gray-600">Respons selesai</p>
          <p className="mt-1 text-3xl font-semibold text-gray-900 tabular-nums">
            {data.totalResponses}
          </p>
        </div>
        <div className="p-4">
          <p className="text-xs text-gray-600">Sedang mengisi</p>
          <p className="mt-1 text-3xl font-semibold text-gray-900 tabular-nums">
            {data.inProgress}
          </p>
        </div>
        <div className="p-4">
          <p className="text-xs text-gray-600">Kuota</p>
          {data.maxRespondents && data.maxRespondents > 0 ? (
            <>
              <p className="mt-1 text-3xl font-semibold text-gray-900 tabular-nums">
                {data.totalResponses}
                <span className="text-base font-normal text-gray-500">/{data.maxRespondents}</span>
              </p>
              <div className="mt-2 h-2 bg-gray-100" aria-hidden="true">
                <div className="h-full bg-primary-600" style={{ width: `${quotaPct}%` }} />
              </div>
            </>
          ) : (
            <p className="mt-1 text-3xl font-semibold text-gray-900">Tak terbatas</p>
          )}
        </div>
      </Card>

      {/* Sebaran */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-gray-900">Sebaran Jenis Kelamin</h2>
          <BarList items={data.byGender} labelMap={GENDER_LABEL} />
        </Card>
        <Card>
          <h2 className="mb-3 text-sm font-semibold text-gray-900">Sebaran Provinsi</h2>
          {/* Semua provinsi tetap ditampilkan seperti sebelumnya, tanpa digabung "Lainnya". */}
          <BarList items={data.byProvince} limit={data.byProvince.length} />
        </Card>
      </div>

      {/* Daftar responden */}
      <Card flush className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr>
                <th className={thCls}>Nama</th>
                <th className={thCls}>Jenis Kelamin</th>
                <th className={thCls}>Provinsi</th>
                <th className={thCls}>Kota/Kab</th>
                <th className={thCls}>Waktu Kirim</th>
              </tr>
            </thead>
            <tbody>
              {data.respondents.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-gray-600">
                    Belum ada respons.
                  </td>
                </tr>
              )}
              {data.respondents.map((r, i) => (
                <tr key={i} className="hover:bg-gray-50 [&:last-child>td]:border-b-0">
                  <td className={`${tdCls} font-medium text-gray-800`}>{r.fullName}</td>
                  <td className={`${tdCls} text-gray-600`}>
                    {r.gender ? (GENDER_LABEL[r.gender] ?? r.gender) : '—'}
                  </td>
                  <td className={`${tdCls} text-gray-600`}>{r.province ?? '—'}</td>
                  <td className={`${tdCls} text-gray-600`}>{r.city ?? '—'}</td>
                  <td className={`${tdCls} text-gray-600`}>{fmtDate(r.submittedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {data.respondents.length >= 500 && (
        <p className="text-xs text-gray-500">Menampilkan 500 responden terbaru.</p>
      )}
    </div>
  );
}
