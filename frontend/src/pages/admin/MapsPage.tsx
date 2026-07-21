import { useEffect, useState } from 'react';
import { api } from '@/services/api';

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

const PRIMARY = '#4f46e5';

function HeatmapPopupBody({ point }: { point: HeatmapPoint }) {
  const list = point.respondents ?? [];
  return (
    <div style={{ maxWidth: 230, maxHeight: 220, overflowY: 'auto', fontSize: 12 }}>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{point.count} responden</div>
      {list.length === 0 && point.city && <div style={{ color: '#6b7280' }}>{point.city}</div>}
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
        <div style={{ color: '#9ca3af', marginTop: 4 }}>+{list.length - 10} responden lainnya…</div>
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
    return (
      <div className="flex h-full items-center justify-center text-gray-500">Memuat peta...</div>
    );
  }

  const { MapContainer, TileLayer, CircleMarker, Popup } = MapComponents;

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
          fillColor={PRIMARY}
          fillOpacity={0.55}
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
          <div className="h-[28rem] overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            {loading ? (
              <div className="flex h-full items-center justify-center text-sm text-gray-500">
                Memuat peta...
              </div>
            ) : error ? (
              <div className="flex h-full items-center justify-center text-sm text-red-500">
                {error}
              </div>
            ) : (
              <LeafletMap points={points} />
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4">
            <p className="text-xs font-medium uppercase tracking-wider text-gray-400">Ringkasan</p>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-gray-900">{total}</span>
              <span className="text-sm text-gray-500">responden berlokasi</span>
            </div>
            <p className="mt-1 text-sm text-gray-500">{points.length} titik lokasi</p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white shadow-sm p-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wider text-gray-400">
              Konsentrasi tertinggi
            </p>
            {topPoints.length === 0 ? (
              <p className="text-sm text-gray-400">Belum ada data lokasi.</p>
            ) : (
              <ul className="divide-y divide-gray-100">
                {topPoints.map((p, idx) => (
                  <li key={idx} className="flex items-center justify-between py-2 text-sm">
                    <span className="truncate text-gray-700">
                      {p.city ?? `${p.latitude.toFixed(3)}, ${p.longitude.toFixed(3)}`}
                    </span>
                    <span
                      className={`ml-2 shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${p.count >= 10 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'}`}
                    >
                      {p.count}
                    </span>
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
