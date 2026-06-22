import { useState, useEffect } from 'react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { FileText, Users, ClipboardList, BarChart3, type LucideIcon } from 'lucide-react';
import { api } from '@/services/api';
import { Card, CardHeader } from '@/components/common/Card';
import { Badge } from '@/components/common/Badge';
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
  name: string;
  value: number;
}

interface DistributionData {
  region: DistributionItem[];
  age: DistributionItem[];
  occupation: DistributionItem[];
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

// Brand-anchored chart palette (indigo primary + orange accent + cool tones)
const COLORS = ['#4f46e5', '#f97316', '#0ea5e9', '#10b981', '#a855f7', '#f59e0b', '#64748b', '#ec4899'];
const CHART_PRIMARY = '#4f46e5';

// Aksen warna per-kartu (kelas literal agar terbaca Tailwind JIT).
const CARD_ACCENTS: Record<string, string> = {
  indigo: 'bg-indigo-50 text-indigo-600 ring-indigo-100',
  sky: 'bg-sky-50 text-sky-600 ring-sky-100',
  orange: 'bg-orange-50 text-orange-600 ring-orange-100',
  emerald: 'bg-emerald-50 text-emerald-600 ring-emerald-100',
};

function OverviewCards({ data, loading }: { data: OverviewData | null; loading: boolean }) {
  const cards: { label: string; value: number; icon: LucideIcon; accent: string }[] = [
    { label: 'Registrasi 24 Jam', value: data?.registrationsLast24h ?? 0, icon: FileText, accent: 'indigo' },
    { label: 'Total Responden', value: data?.totalRespondents ?? 0, icon: Users, accent: 'sky' },
    { label: 'Survei Aktif', value: data?.activeSurveys ?? 0, icon: ClipboardList, accent: 'orange' },
    { label: 'Total Respons', value: data?.totalResponses ?? 0, icon: BarChart3, accent: 'emerald' },
  ];

  if (loading) {
    return (
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i} className="animate-pulse">
            <div className="mb-3 h-3.5 w-3/4 rounded bg-gray-200" />
            <div className="h-7 w-1/2 rounded bg-gray-200" />
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
      {cards.map(({ label, value, icon: Icon, accent }) => (
        <Card key={label}>
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-500 sm:text-sm">{label}</p>
              <p className="mt-1.5 text-xl font-bold tracking-tight text-gray-900 sm:text-2xl">
                {value.toLocaleString('id-ID')}
              </p>
            </div>
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${CARD_ACCENTS[accent]}`}
            >
              <Icon className="h-5 w-5" strokeWidth={1.85} />
            </span>
          </div>
        </Card>
      ))}
    </div>
  );
}

function RegistrationBarChart() {
  const [data, setData] = useState<RegistrationChartItem[]>([]);
  const [period, setPeriod] = useState<'7d' | '30d' | '90d'>('7d');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
        const startDate = format(subDays(new Date(), days), 'yyyy-MM-dd');
        const endDate = format(new Date(), 'yyyy-MM-dd');
        const result = await api.get<any>(
          `/dashboard/registration-chart?startDate=${startDate}&endDate=${endDate}`
        );
        // Backend returns { labels: [...], datasets: [{ data: [...] }] }
        // Convert to array format for Recharts
        if (result && result.labels && result.datasets) {
          const chartData = result.labels.map((label: string, idx: number) => ({
            date: label,
            count: result.datasets[0]?.data[idx] ?? 0,
          }));
          setData(chartData);
        } else if (Array.isArray(result)) {
          setData(result);
        } else {
          setData([]);
        }
      } catch {
        setData([]);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, [period]);

  return (
    <Card>
      <CardHeader
        title="Registrasi Harian"
        action={
          <div className="flex gap-1 rounded-lg bg-gray-100 p-1">
            {(['7d', '30d', '90d'] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  period === p
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        }
      />
      {loading ? (
        <div className="flex h-64 items-center justify-center text-sm text-gray-500">Memuat...</div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
            <Tooltip
              cursor={{ fill: 'rgba(79,70,229,0.06)' }}
              contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }}
            />
            <Bar dataKey="count" fill={CHART_PRIMARY} name="Registrasi" radius={[4, 4, 0, 0]} maxBarSize={44} />
          </BarChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

function CumulativeTrendChart() {
  const [data, setData] = useState<CumulativeTrendItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const startDate = format(subDays(new Date(), 30), 'yyyy-MM-dd');
        const endDate = format(new Date(), 'yyyy-MM-dd');
        const result = await api.get<any>(
          `/dashboard/cumulative-trend?startDate=${startDate}&endDate=${endDate}`
        );
        // Backend returns { labels: [...], datasets: [{ data: [...] }] }
        if (result && result.labels && result.datasets) {
          const chartData = result.labels.map((label: string, idx: number) => ({
            date: label,
            total: result.datasets[0]?.data[idx] ?? 0,
          }));
          setData(chartData);
        } else if (Array.isArray(result)) {
          setData(result);
        } else {
          setData([]);
        }
      } catch {
        setData([]);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  return (
    <Card>
      <CardHeader title="Tren Kumulatif Responden" />
      {loading ? (
        <div className="flex h-64 items-center justify-center text-sm text-gray-500">Memuat...</div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }} />
            <Line
              type="monotone"
              dataKey="total"
              stroke={CHART_PRIMARY}
              strokeWidth={2.5}
              name="Total"
              dot={false}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      )}
    </Card>
  );
}

function DistributionCharts() {
  const [data, setData] = useState<DistributionData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const result = await api.get<DistributionData>('/dashboard/distribution');
        setData(result);
      } catch {
        setData(null);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return (
      <Card>
        <div className="flex h-64 items-center justify-center text-sm text-gray-500">Memuat...</div>
      </Card>
    );
  }

  const charts = [
    { title: 'Distribusi Wilayah', data: (data as any)?.byRegion ?? data?.region ?? [] },
    { title: 'Distribusi Usia', data: (data as any)?.byAge ?? data?.age ?? [] },
    { title: 'Distribusi Pekerjaan', data: (data as any)?.byOccupation ?? data?.occupation ?? [] },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
      {charts.map((chart) => (
        <Card key={chart.title}>
          <CardHeader title={chart.title} />
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={Array.isArray(chart.data) ? chart.data : []}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={80}
                dataKey="value"
                nameKey="label"
                label={(props: any) => `${props.label ?? props.name ?? ''} ${((props.percent ?? 0) * 100).toFixed(0)}%`}
                labelLine={false}
              >
                {(Array.isArray(chart.data) ? chart.data : []).map((_: any, index: number) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip contentStyle={{ borderRadius: 10, border: '1px solid #e2e8f0', fontSize: 12 }} />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      ))}
    </div>
  );
}

function HeatmapSection() {
  const [points, setPoints] = useState<HeatmapPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const result = await api.get<HeatmapPoint[]>('/dashboard/heatmap');
        setPoints(Array.isArray(result) ? result : []);
      } catch {
        setError('Gagal memuat data peta');
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader title="Peta Distribusi Responden" />
        <div className="flex h-80 items-center justify-center text-sm text-gray-500">Memuat peta...</div>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader title="Peta Distribusi Responden" />
        <div className="flex h-80 items-center justify-center text-sm text-red-500">{error}</div>
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
      {list.length === 0 && point.city && (
        <div style={{ color: '#6b7280' }}>{point.city}</div>
      )}
      {list.slice(0, 10).map((r, i) => (
        <div key={i} style={{ borderTop: '1px solid #eee', paddingTop: 4, marginTop: 4 }}>
          <div style={{ fontWeight: 500 }}>{r.name}</div>
          {r.submittedAt && (
            <div style={{ color: '#6b7280' }}>
              {new Date(r.submittedAt).toLocaleString('id-ID', {
                dateStyle: 'medium',
                timeStyle: 'short',
              })}
            </div>
          )}
          <div style={{ color: '#374151' }}>
            {[r.province, r.city, r.district].filter(Boolean).join(' · ') || '-'}
          </div>
        </div>
      ))}
      {list.length > 10 && (
        <div style={{ color: '#9ca3af', marginTop: 4 }}>
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
      }
    );
  }, []);

  if (!MapComponents) {
    return <div className="h-full flex items-center justify-center text-gray-500">Memuat peta...</div>;
  }

  const { MapContainer, TileLayer, CircleMarker, Popup } = MapComponents;

  return (
    <MapContainer
      center={[-2.5, 118]}
      zoom={5}
      style={{ height: '100%', width: '100%' }}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {points.map((point, idx) => (
        <CircleMarker
          key={idx}
          center={[point.latitude, point.longitude]}
          radius={Math.min(Math.max(point.count / 2, 5), 20)}
          fillColor={CHART_PRIMARY}
          fillOpacity={0.6}
          stroke={false}
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
  const [data, setData] = useState<CompletionRate[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const result = await api.get<CompletionRate[]>('/dashboard/completion-rates');
        setData(Array.isArray(result) ? result : []);
      } catch {
        setData([]);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  return (
    <Card flush>
      <div className="px-5 pt-5 sm:px-6">
        <CardHeader title="Tingkat Penyelesaian Survei" />
      </div>
      {loading ? (
        <div className="flex h-32 items-center justify-center text-sm text-gray-500">Memuat...</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead>
              <tr className="border-y border-gray-200 bg-gray-50/60">
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Survei</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Total Respons</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Selesai</th>
                <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-500">Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-6 py-10 text-center text-sm text-gray-500">
                    Belum ada data
                  </td>
                </tr>
              ) : (
                data.map((item) => {
                  const rate = Number(item.completionRate ?? 0);
                  return (
                  <tr key={item.surveyId} className="transition-colors hover:bg-gray-50/60">
                    <td className="px-6 py-3.5 text-sm font-medium text-gray-900">{item.surveyTitle}</td>
                    <td className="px-6 py-3.5 text-sm text-gray-600">{item.totalResponses}</td>
                    <td className="px-6 py-3.5 text-sm text-gray-600">{item.completedResponses}</td>
                    <td className="px-6 py-3.5 text-sm">
                      <Badge
                        tone={rate >= 75 ? 'success' : rate >= 50 ? 'warning' : 'danger'}
                        dot
                      >
                        {rate.toFixed(1)}%
                      </Badge>
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
  const [overview, setOverview] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchOverview = async () => {
      try {
        const result = await api.get<OverviewData>('/dashboard/overview');
        setOverview(result);
      } catch {
        setOverview(null);
      } finally {
        setLoading(false);
      }
    };
    fetchOverview();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Dashboard</h1>
        <p className="mt-1 text-sm text-gray-500">Ringkasan aktivitas survei dan responden.</p>
      </div>

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
