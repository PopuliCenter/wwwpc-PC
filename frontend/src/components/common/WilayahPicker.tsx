import { useState, useEffect } from 'react';
import { getProvinces, getRegencies, getDistricts, type WilayahItem } from '@/utils/wilayah';

interface WilayahValue {
  province: string;
  city: string;
  district: string;
}

interface Props {
  value: WilayahValue;
  onChange: (v: WilayahValue) => void;
  required?: boolean;
}

const selectCls =
  'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 disabled:bg-gray-50 disabled:text-gray-400';

/**
 * Dropdown wilayah berjenjang: Provinsi → Kabupaten/Kota → Kecamatan.
 * Memilih provinsi memuat kab/kota-nya saja, dst. Mengeluarkan NAMA wilayah
 * (bukan id) lewat onChange agar mudah disimpan & diekspor. Data dari
 * utils/wilayah (API wilayah administrasi Indonesia, sampai kecamatan).
 */
export function WilayahPicker({ value, onChange, required }: Props) {
  const [provinces, setProvinces] = useState<WilayahItem[]>([]);
  const [regencies, setRegencies] = useState<WilayahItem[]>([]);
  const [districts, setDistricts] = useState<WilayahItem[]>([]);
  const [provId, setProvId] = useState('');
  const [regId, setRegId] = useState('');
  const [distId, setDistId] = useState('');

  useEffect(() => {
    let active = true;
    getProvinces()
      .then((d) => active && setProvinces(d))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const handleProvince = async (id: string) => {
    const name = provinces.find((p) => p.id === id)?.name ?? '';
    setProvId(id);
    setRegId('');
    setDistId('');
    setRegencies([]);
    setDistricts([]);
    onChange({ province: name, city: '', district: '' });
    if (id) {
      try {
        setRegencies(await getRegencies(id));
      } catch {
        /* abaikan kegagalan jaringan */
      }
    }
  };

  const handleRegency = async (id: string) => {
    const name = regencies.find((r) => r.id === id)?.name ?? '';
    setRegId(id);
    setDistId('');
    setDistricts([]);
    onChange({ province: value.province, city: name, district: '' });
    if (id) {
      try {
        setDistricts(await getDistricts(id));
      } catch {
        /* abaikan */
      }
    }
  };

  const handleDistrict = (id: string) => {
    const name = districts.find((d) => d.id === id)?.name ?? '';
    setDistId(id);
    onChange({ province: value.province, city: value.city, district: name });
  };

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Provinsi</label>
        <select
          value={provId}
          onChange={(e) => handleProvince(e.target.value)}
          required={required}
          className={selectCls}
        >
          <option value="" disabled>
            {provinces.length ? 'Pilih provinsi…' : 'Memuat…'}
          </option>
          {provinces.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Kabupaten/Kota</label>
        <select
          value={regId}
          onChange={(e) => handleRegency(e.target.value)}
          required={required}
          disabled={!provId}
          className={selectCls}
        >
          <option value="" disabled>
            {!provId ? 'Pilih provinsi dulu' : 'Pilih kab/kota…'}
          </option>
          {regencies.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-gray-700">Kecamatan</label>
        <select
          value={distId}
          onChange={(e) => handleDistrict(e.target.value)}
          required={required}
          disabled={!regId}
          className={selectCls}
        >
          <option value="" disabled>
            {!regId ? 'Pilih kab/kota dulu' : 'Pilih kecamatan…'}
          </option>
          {districts.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
