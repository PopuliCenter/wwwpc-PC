import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { api } from '@/services/api';
import { BarList } from '@/components/common/BarList';
import { SegmentedControl } from '@/components/common/SegmentedControl';
import { thBaseCls, tdBaseCls } from '@/components/common/tableStyles';
import { Card, CardHeader } from '@/components/common/Card';
import { Skeleton, TableSkeleton } from '@/components/common/Skeleton';
import {
  axis,
  grid,
  latestPoint,
  navy1,
  sequentialColor,
  tooltipLabel,
  tooltipMuted,
  tooltipValue,
} from '@/utils/chartTokens';
import { format, subDays } from 'date-fns';

// Types
interface OverviewData {
  registrationsLast24h: number;
  totalRespondents: number;
  activeSurveys: number;
  totalResponses: number;
}

interface RegistrationChartItem {
  date: string;
  count: number;
}

interface CumulativeTrendItem {
  date: string;
  total: number;
}

interface DistributionItem {
  // Backend mengirim `label`; `name` tetap didukung untuk bentuk lama.
  label?: string;
  name?: string;
  value: number;
}

interface DistributionData {
  region?: DistributionItem[];
  age?: DistributionItem[];
  occupation?: DistributionItem[];
  // Backend bisa memakai penamaan by* — dukung keduanya.
  byRegion?: DistributionItem[];
  byAge?: DistributionItem[];
  byOccupation?: DistributionItem[];
}

/** Bentuk respons chart deret-waktu backend: { labels, datasets:[{data}] }. */
interface ChartSeriesResponse {
  labels?: string[];
  datasets?: { data: number[] }[];
}

interface HeatmapRespondent {
  name: string;
  submittedAt: string | null;
  province: string | null;
  city: string | null;
  district: string | null;
}

interface HeatmapPoint {
  latitude: number;
  longitude: number;
  count: number;
  city?: string;
  respondents?: HeatmapRespondent[];
}

interface CompletionRate {
  surveyId: string;
  surveyTitle: string;
  totalResponses: number;
  completedResponses: number;
  completionRate: number;
}

const axisTick = { fontSize: 12, fill: axis };
const chartTooltipStyle = { borderRadius: 6, border: `1px solid ${grid}`, fontSize: 13 };

// Tabel gaya laporan: garis tebal navy di bawah kepala, garis tipis antar baris.
const thCls = `${thBaseCls} py-2.5 text-left`;
const thNumCls = `${thBaseCls} py-2.5 text-right`;
const tdCls = `${tdBaseCls} py-3 text-sm`;

const PERIODS = [
  { key: '7d', label: '7 hari' },
  { key: '30d', label: '30 hari' },
  { key: '90d', label: '90 hari' },
] as const;

function OverviewCards({ data, loading }: { data: OverviewData | null; loading: boolean }) {
  const cells: { label: string; value: number; note?: string }[] = [
    {
      label: 'Registrasi 24 Jam',
      value: data?.registrationsLast24h ?? 0,
    },
    {
      label: 'Total Responden',
      value: data?.totalRespondents ?? 0,
    },
    {
      label: 'Survei Aktif',
      value: data?.activeSurveys ?? 0,
    },
    {
      label: 'Total Respons',
      value: data?.totalResponses ?? 0,
      note: 'Termasuk yang belum selesai',
    },
  ];

  // Satu panel dibagi garis (gap-px di atas latar gray-200), bukan empat kartu.
  return (
    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-gray-200 bg-gray-200 lg:grid-cols-4">
      {cells.map(({ label, value, note }) => (
        <div key={label} className="min-w-0 bg-white px-4 py-4 sm:px-5">
          <p className="text-xs text-gray-600">{label}</p>
          {loading ? (
            <>
              <Skeleton className="mt-1.5 h-9 w-2/3" />
              {note && <Skeleton className="mt-1.5 h-4 w-5/6" />}
            </>
          ) : (
            <>
              <p className="mt-1 text-3xl font-semibold tabular-nums text-gray-900">
                {value.toLocaleString('id-ID')}
              </p>
              {note && <p className="mt-1 text-xs text-gray-600">{note}</p>}
            </>
          )}
        </div>
      ))}
    </div>
  );
}

function RegistrationBarChart() {
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('7d');

  const { data = [], isLoading: loading } = useQuery({
    queryKey: ['dashboard', 'registration-chart', period],
    queryFn: async (): Promise<RegistrationChartItem[]> => {
      const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
      const startDate = format(subDays(new Date(), days), 'yyyy-MM-dd');
      const endDate = format(new Date(), 'yyyy-MM-dd');
      const result = await api.get<ChartSeriesResponse | RegistrationChartItem[]>(
        `/dashboard/registration-chart?startDate=${startDate}&endDate=${endDate}`,
      );
      // Backend bisa mengembalikan { labels, datasets:[{data}] } atau array langsung.
      if (Array.isArray(result)) return result;
      if (result?.labels && result.datasets) {
        const datasets = result.datasets;
        return result.labels.map((label, idx) => ({
          date: label,
          count: datasets[0]?.data[idx] ?? 0,
        }));
      }
      return [];
    },
  });

  return (
    <Card>
      <CardHeader
        title="Registrasi Harian"
        action={
          <SegmentedControl
            label="Rentang waktu"
            options={PERIODS}
            value={period}
            onChange={setPeriod}
            itemClassName="min-h-11 px-2.5 lg:min-h-9 lg:px-3"
          />
        }
      />
      {loading ? (
        <Skeleton className="h-[300px] w-full" />
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}>
            <CartesianGrid stroke={grid} vertical={false} />
            <XAxis dataKey="date" tick={axisTick} axisLine={false} tickLine={false} />
            <YAxis tick={axisTick} axisLine={false} tickLine={false} />
            <Tooltip cursor={{ fill: grid, fillOpacity: 0.4 }} contentStyle={chartTooltipStyle} />
            <Bar dataKey="count" fill={navy1} name="Registrasi" maxBarSize={44} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

function CumulativeTrendChart() {
  const { data = [], isLoading: loading } = useQuery({
    queryKey: ['dashboard', 'cumulative-trend'],
    queryFn: async (): Promise<CumulativeTrendItem[]> => {
      const startDate = format(subDays(new Date(), 30), 'yyyy-MM-dd');
      const endDate = format(new Date(), 'yyyy-MM-dd');
      const result = await api.get<ChartSeriesResponse | CumulativeTrendItem[]>(
        `/dashboard/cumulative-trend?startDate=${startDate}&endDate=${endDate}`,
      );
      if (Array.isArray(result)) return result;
      if (result?.labels && result.datasets) {
        const datasets = result.datasets;
        return result.labels.map((label, idx) => ({
          date: label,
          total: datasets[0]?.data[idx] ?? 0,
        }));
      }
      return [];
    },
  });

  return (
    <Card>
      <CardHeader title="Tren Kumulatif Responden" />
      {loading ? (
        <Skeleton className="h-[300px] w-full" />
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data} margin={{ top: 22, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={grid} vertical={false} />
            <XAxis dataKey="date" tick={axisTick} axisLine={false} tickLine={false} />
            <YAxis tick={axisTick} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={chartTooltipStyle} />
            <Line
              type="monotone"
              dataKey="total"
              stroke={navy1}
              strokeWidth={2}
              name="Total"
              // Hanya titik terbaru yang ditandai dan diberi label angka.
              dot={({ index, cx, cy }) => {
                if (index !== data.length - 1 || cx == null || cy == null) {
                  return <g key={index} />;
                }
                return (
                  <g key={index}>
                    <circle cx={cx} cy={cy} r={4} fill={latestPoint} />
                    <text
                      x={cx}
                      y={cy - 10}
                      textAnchor="end"
                      fontSize={13}
                      fontWeight={600}
                      fill={tooltipValue}
                    >
                      {Number(data[index]?.total ?? 0).toLocaleString('id-ID')}
                    </text>
                  </g>
                );
              }}
              activeDot={{ r: 5, fill: navy1 }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

function DistributionCharts() {
  const { data = null, isLoading: loading } = useQuery({
    queryKey: ['dashboard', 'distribution'],
    queryFn: () => api.get<DistributionData>('/dashboard/distribution'),
  });

  const charts: { title: string; data: DistributionItem[] }[] = [
    { title: 'Distribusi Wilayah', data: data?.byRegion ?? data?.region ?? [] },
    { title: 'Distribusi Usia', data: data?.byAge ?? data?.age ?? [] },
    { title: 'Distribusi Pekerjaan', data: data?.byOccupation ?? data?.occupation ?? [] },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {charts.map((chart) => (
        <Card key={chart.title}>
          <CardHeader title={chart.title} />
          {loading ? (
            <div className="space-y-4">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <Skeleton key={i} className="h-7 w-full" />
              ))}
            </div>
          ) : (
            <BarList
              items={(Array.isArray(chart.data) ? chart.data : []).map((item) => ({
                label: item.label ?? item.name ?? '-',
                count: item.value,
              }))}
            />
          )}
        </Card>
      ))}
    </div>
  );
}

function HeatmapSection() {
  const {
    data: points = [],
    isLoading: loading,
    isError,
  } = useQuery({
    queryKey: ['dashboard', 'heatmap'],
    queryFn: async (): Promise<HeatmapPoint[]> => {
      const result = await api.get<HeatmapPoint[]>('/dashboard/heatmap');
      return Array.isArray(result) ? result : [];
    },
  });
  const error = isError ? 'Gagal memuat data peta' : null;

  if (loading) {
    return (
      <Card>
        <CardHeader title="Peta Distribusi Responden" />
        <Skeleton className="h-80 w-full" />
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader title="Peta Distribusi Responden" />
        <div className="flex h-80 items-center justify-center text-sm text-danger-fg">{error}</div>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader title="Peta Distribusi Responden" />
      <div className="h-80 overflow-hidden rounded-lg border border-gray-200">
        <LeafletMap points={points} />
      </div>
    </Card>
  );
}

function HeatmapPopupBody({ point }: { point: HeatmapPoint }) {
  const list = point.respondents ?? [];
  return (
    <div style={{ maxWidth: 230, maxHeight: 220, overflowY: 'auto', fontSize: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{point.count} responden</div>
      {list.length === 0 && point.city && <div style={{ color: tooltipLabel }}>{point.city}</div>}
      {list.slice(0, 10).map((r, i) => (
        <div key={i} style={{ borderTop: `1px solid ${grid}`, paddingTop: 4, marginTop: 4 }}>
          <div style={{ fontWeight: 500 }}>{r.name}</div>
          {r.submittedAt && (
            <div style={{ color: tooltipLabel }}>
              {new Date(r.submittedAt).toLocaleString('id-ID', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </div>
          )}
          <div style={{ color: tooltipValue }}>
            {[r.province, r.city, r.district].filter(Boolean).join(' · ') || '-'}
          </div>
        </div>
      ))}
      {list.length > 10 && (
        <div style={{ color: tooltipMuted, marginTop: 4 }}>
          +{list.length - 10} responden lainnya…
        </div>
      )}
    </div>
  );
}

function LeafletMap({ points }: { points: HeatmapPoint[] }) {
  const [MapComponents, setMapComponents] = useState<{
    MapContainer: typeof import('react-leaflet').MapContainer;
    TileLayer: typeof import('react-leaflet').TileLayer;
    CircleMarker: typeof import('react-leaflet').CircleMarker;
    Popup: typeof import('react-leaflet').Popup;
  } | null>(null);

  useEffect(() => {
    // Dynamic import to avoid SSR issues
    Promise.all([import('react-leaflet'), import('leaflet/dist/leaflet.css')]).then(
      ([reactLeaflet]) => {
        setMapComponents({
          MapContainer: reactLeaflet.MapContainer,
          TileLayer: reactLeaflet.TileLayer,
          CircleMarker: reactLeaflet.CircleMarker,
          Popup: reactLeaflet.Popup,
        });
      },
    );
  }, []);

  if (!MapComponents) {
    return <Skeleton className="h-full w-full rounded-none" />;
  }

  const { MapContainer, TileLayer, CircleMarker, Popup } = MapComponents;
  const maxCount = points.reduce((max, p) => Math.max(max, p.count), 0);

  return (
    <MapContainer center={[-2.5, 118]} zoom={5} style={{ height: '100%', width: '100%' }}>
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {points.map((point, idx) => (
        <CircleMarker
          key={idx}
          center={[point.latitude, point.longitude]}
          radius={Math.min(Math.max(point.count / 2, 5), 20)}
          // Gaya wajib lewat pathOptions: react-leaflet hanya memperbarui center dan radius
          // dari prop langsung, sehingga warna titik tertinggal saat data berubah.
          pathOptions={{
            fillColor: sequentialColor(point.count, maxCount),
            fillOpacity: 0.8,
            color: navy1,
            weight: 1,
          }}
        >
          <Popup>
            <HeatmapPopupBody point={point} />
          </Popup>
        </CircleMarker>
      ))}
    </MapContainer>
  );
}

function CompletionRatesTable() {
  const { data = [], isLoading: loading } = useQuery({
    queryKey: ['dashboard', 'completion-rates'],
    queryFn: async (): Promise<CompletionRate[]> => {
      const result = await api.get<CompletionRate[]>('/dashboard/completion-rates');
      return Array.isArray(result) ? result : [];
    },
  });

  return (
    <Card flush className="overflow-hidden">
      <div className="px-5 pt-5 sm:px-6">
        <CardHeader title="Tingkat Penyelesaian Survei" />
      </div>
      {loading ? (
        <TableSkeleton rows={4} cols={4} />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full">
            <thead>
              <tr>
                <th className={thCls}>Survei</th>
                <th className={thNumCls}>Total respons</th>
                <th className={thNumCls}>Selesai</th>
                <th className={thNumCls}>
                  Tingkat penyelesaian
                  <span className="block font-normal text-gray-500">
                    Perlu ditinjau di bawah 75%, rendah di bawah 50%
                  </span>
                </th>
              </tr>
            </thead>
            <tbody className="[&>tr:last-child>td]:border-b-0">
              {data.length === 0 ? (
                <tr>
                  <td
                    colSpan={4}
                    className="border-b border-gray-100 px-4 py-10 text-center text-sm text-gray-600"
                  >
                    Belum ada data
                  </td>
                </tr>
              ) : (
                data.map((item) => {
                  const rate = Number(item.completionRate ?? 0);
                  // Warna dan ikon menandai ambang di judul kolom; angkanya selalu tertulis.
                  const rateTone =
                    rate >= 75
                      ? 'text-gray-900'
                      : rate >= 50
                        ? 'text-warning-fg'
                        : 'text-danger-fg';
                  return (
                    <tr key={item.surveyId} className="hover:bg-gray-50">
                      <td className={`${tdCls} font-medium text-gray-900`}>{item.surveyTitle}</td>
                      <td className={`${tdCls} text-right tabular-nums text-gray-600`}>
                        {item.totalResponses}
                      </td>
                      <td className={`${tdCls} text-right tabular-nums text-gray-600`}>
                        {item.completedResponses}
                      </td>
                      <td className={`${tdCls} text-right font-medium tabular-nums ${rateTone}`}>
                        <span className="inline-flex items-center justify-end gap-1">
                          {rate < 75 && (
                            <AlertTriangle
                              className="h-3.5 w-3.5 shrink-0"
                              strokeWidth={1.75}
                              aria-label={rate < 50 ? 'Rendah' : 'Perlu ditinjau'}
                            />
                          )}
                          {rate.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}

export function DashboardPage() {
  const { data: overview = null, isLoading: loading } = useQuery({
    queryKey: ['dashboard', 'overview'],
    queryFn: () => api.get<OverviewData>('/dashboard/overview'),
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold tracking-tight text-gray-900">Dashboard</h1>

      <OverviewCards data={overview} loading={loading} />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RegistrationBarChart />
        <CumulativeTrendChart />
      </div>

      <DistributionCharts />

      <HeatmapSection />

      <CompletionRatesTable />
    </div>
  );
}
