import { useState, useEffect } from 'react';
import { MapPin } from 'lucide-react';
import {
  getProvinces,
  getRegencies,
  getDistricts,
  getVillages,
  type WilayahItem,
} from '@/utils/wilayah';
import type { RendererProps } from '@/types/survey';
import { fieldClasses } from './shared';

/** Nilai jawaban pertanyaan wilayah: id + nama tiap tingkat yang dipilih. */
type RegionValue = {
  province_id?: string;
  province_name?: string;
  regency_id?: string;
  regency_name?: string;
  district_id?: string;
  district_name?: string;
  village_id?: string;
  village_name?: string;
};

/**
 * Pemilih wilayah Indonesia bertingkat (Provinsi → Kab/Kota → Kecamatan →
 * Kelurahan/Desa). Kedalaman & penguncian awal diatur lewat `regionConfig`
 * pertanyaan. Tiap tingkat dimuat malas saat tingkat di atasnya dipilih.
 */
export function IndonesiaRegionQuestion({ question, value, onChange, invalid }: RendererProps) {
  const cfg = question.regionConfig;
  const depth = cfg?.regionDepth ?? 'village';
  const lockedProvince = cfg?.lockedProvince;
  const lockedRegency = cfg?.lockedRegency;

  const regionVal = (value as RegionValue) ?? {};

  const [provinces, setProvinces] = useState<WilayahItem[]>([]);
  const [regencies, setRegencies] = useState<WilayahItem[]>([]);
  const [districts, setDistricts] = useState<WilayahItem[]>([]);
  const [villages, setVillages] = useState<WilayahItem[]>([]);
  const [loadingLevel, setLoadingLevel] = useState<string | null>(null);

  const depthOrder = ['province', 'regency', 'district', 'village'];
  const depthIndex = depthOrder.indexOf(depth);

  // Load provinces (unless locked)
  useEffect(() => {
    if (lockedProvince) {
      setProvinces([lockedProvince]);
      return;
    }
    setLoadingLevel('province');
    getProvinces()
      .then(setProvinces)
      .catch(() => setProvinces([]))
      .finally(() => setLoadingLevel(null));
  }, [lockedProvince]);

  // Load regencies when province is selected
  useEffect(() => {
    const provId = lockedProvince?.id ?? regionVal.province_id;
    if (!provId || depthIndex < 1) return;
    if (lockedRegency) {
      setRegencies([lockedRegency]);
      return;
    }
    setLoadingLevel('regency');
    getRegencies(provId)
      .then(setRegencies)
      .catch(() => setRegencies([]))
      .finally(() => setLoadingLevel(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionVal.province_id, lockedProvince, lockedRegency, depthIndex]);

  // Load districts when regency is selected
  useEffect(() => {
    const regId = lockedRegency?.id ?? regionVal.regency_id;
    if (!regId || depthIndex < 2) return;
    setLoadingLevel('district');
    getDistricts(regId)
      .then(setDistricts)
      .catch(() => setDistricts([]))
      .finally(() => setLoadingLevel(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionVal.regency_id, lockedRegency, depthIndex]);

  // Load villages when district is selected
  useEffect(() => {
    const distId = regionVal.district_id;
    if (!distId || depthIndex < 3) return;
    setLoadingLevel('village');
    getVillages(distId)
      .then(setVillages)
      .catch(() => setVillages([]))
      .finally(() => setLoadingLevel(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [regionVal.district_id, depthIndex]);

  const selectStyle = fieldClasses(invalid);

  const setField = (updates: Partial<RegionValue>) => {
    onChange({ ...regionVal, ...updates });
  };

  const clearBelow = (level: 'province' | 'regency' | 'district') => {
    const clears: Partial<RegionValue> = {};
    if (level === 'province') {
      clears.regency_id = undefined;
      clears.regency_name = undefined;
      clears.district_id = undefined;
      clears.district_name = undefined;
      clears.village_id = undefined;
      clears.village_name = undefined;
      setRegencies([]);
      setDistricts([]);
      setVillages([]);
    } else if (level === 'regency') {
      clears.district_id = undefined;
      clears.district_name = undefined;
      clears.village_id = undefined;
      clears.village_name = undefined;
      setDistricts([]);
      setVillages([]);
    } else {
      clears.village_id = undefined;
      clears.village_name = undefined;
      setVillages([]);
    }
    return clears;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1.5 text-xs text-gray-500">
        <MapPin className="h-3.5 w-3.5" />
        Pilih wilayah secara berurutan
      </div>

      {/* Provinsi */}
      <div>
        <label className="mb-1 block text-xs font-medium text-gray-600">Provinsi</label>
        <select
          value={lockedProvince ? lockedProvince.id : (regionVal.province_id ?? '')}
          disabled={!!lockedProvince || loadingLevel === 'province'}
          onChange={(e) => {
            const item = provinces.find((p) => p.id === e.target.value);
            setField({
              province_id: item?.id,
              province_name: item?.name,
              ...clearBelow('province'),
            });
          }}
          className={selectStyle}
        >
          <option value="">
            {loadingLevel === 'province' ? 'Memuat...' : '— Pilih Provinsi —'}
          </option>
          {provinces.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {/* Kabupaten/Kota */}
      {depthIndex >= 1 && (
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Kabupaten / Kota</label>
          <select
            value={lockedRegency ? lockedRegency.id : (regionVal.regency_id ?? '')}
            disabled={!!lockedRegency || !regionVal.province_id || loadingLevel === 'regency'}
            onChange={(e) => {
              const item = regencies.find((r) => r.id === e.target.value);
              setField({
                regency_id: item?.id,
                regency_name: item?.name,
                ...clearBelow('regency'),
              });
            }}
            className={selectStyle}
          >
            <option value="">
              {loadingLevel === 'regency'
                ? 'Memuat...'
                : !regionVal.province_id
                  ? '— Pilih provinsi dulu —'
                  : '— Pilih Kabupaten/Kota —'}
            </option>
            {regencies.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Kecamatan */}
      {depthIndex >= 2 && (
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Kecamatan</label>
          <select
            value={regionVal.district_id ?? ''}
            disabled={!regionVal.regency_id || loadingLevel === 'district'}
            onChange={(e) => {
              const item = districts.find((d) => d.id === e.target.value);
              setField({
                district_id: item?.id,
                district_name: item?.name,
                ...clearBelow('district'),
              });
            }}
            className={selectStyle}
          >
            <option value="">
              {loadingLevel === 'district'
                ? 'Memuat...'
                : !regionVal.regency_id
                  ? '— Pilih kabupaten/kota dulu —'
                  : '— Pilih Kecamatan —'}
            </option>
            {districts.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Kelurahan/Desa */}
      {depthIndex >= 3 && (
        <div>
          <label className="mb-1 block text-xs font-medium text-gray-600">Kelurahan / Desa</label>
          <select
            value={regionVal.village_id ?? ''}
            disabled={!regionVal.district_id || loadingLevel === 'village'}
            onChange={(e) => {
              const item = villages.find((v) => v.id === e.target.value);
              setField({ village_id: item?.id, village_name: item?.name });
            }}
            className={selectStyle}
          >
            <option value="">
              {loadingLevel === 'village'
                ? 'Memuat...'
                : !regionVal.district_id
                  ? '— Pilih kecamatan dulu —'
                  : '— Pilih Kelurahan/Desa —'}
            </option>
            {villages.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}
