import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { api } from '@/services/api';
import { Badge } from '@/components/common/Badge';
import { Skeleton } from '@/components/common/Skeleton';
import {
  grid,
  navy1,
  sequentialColor,
  tooltipLabel,
  tooltipMuted,
  tooltipValue,
} from '@/utils/chartTokens';

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

// Titik dengan jumlah responden sebanyak ini ditandai sebagai kandidat anomali.
const CONCENTRATION_THRESHOLD = 10;

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
          radius={Math.min(Math.max(point.count / 2, 5), 24)}
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

export function MapsPage() {
  const [points, setPoints] = useState<HeatmapPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const result = await api.get<HeatmapPoint[]>('/dashboard/heatmap');
        if (active) setPoints(Array.isArray(result) ? result : []);
      } catch {
        if (active) setError('Gagal memuat data peta');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const total = points.reduce((sum, p) => sum + p.count, 0);
  // Titik konsentrasi tertinggi → kandidat anomali untuk ditinjau
  const topPoints = [...points].sort((a, b) => b.count - a.count).slice(0, 10);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Peta Sebaran Responden</h1>
        <p className="mt-1 text-sm text-gray-500">
          Distribusi geografis responden untuk meninjau pola pengisian survei (deteksi konsentrasi
          tidak wajar).
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div className="h-[28rem] overflow-hidden rounded-xl border border-gray-200 bg-panel">
            {loading ? (
              <Skeleton className="h-full w-full rounded-none" />
            ) : error ? (
              <div className="flex h-full items-center justify-center text-sm text-danger-fg">
                {error}
              </div>
            ) : (
              <LeafletMap points={points} />
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-panel p-4">
            <p className="text-xs text-gray-600">Ringkasan</p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="text-3xl font-semibold tabular-nums text-gray-900">{total}</span>
              <span className="text-sm text-gray-600">responden berlokasi</span>
            </div>
            <p className="mt-1 text-xs tabular-nums text-gray-600">{points.length} titik lokasi</p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-panel p-4">
            <p className="text-sm font-semibold text-gray-900">Konsentrasi tertinggi</p>
            <p className="mb-2 mt-0.5 text-xs text-gray-600">
              Titik dengan {CONCENTRATION_THRESHOLD} responden atau lebih ditandai peringatan.
            </p>
            {topPoints.length === 0 ? (
              <p className="text-sm text-gray-500">Belum ada data lokasi.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {topPoints.map((p, idx) => (
                  <li key={idx} className="flex items-center justify-between gap-2 py-2 text-sm">
                    <span className="truncate text-gray-700">
                      {p.city ?? `${p.latitude.toFixed(3)}, ${p.longitude.toFixed(3)}`}
                    </span>
                    {p.count >= CONCENTRATION_THRESHOLD ? (
                      <Badge tone="warning" icon={AlertTriangle} className="shrink-0 tabular-nums">
                        {p.count}
                      </Badge>
                    ) : (
                      <span className="shrink-0 text-xs font-medium tabular-nums text-gray-800">
                        {p.count}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
