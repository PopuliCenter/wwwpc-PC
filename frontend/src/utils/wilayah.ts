/**
 * Layanan data wilayah Indonesia — provinsi, kabupaten/kota, kecamatan, dan
 * kelurahan/desa.
 *
 * Data DI-BUNDLE LOKAL di `public/wilayah/*.json` (sumber: guzfirdaus/
 * Wilayah-Administrasi-Indonesia, kode Permendagri). Tidak ada ketergantungan
 * API eksternal saat runtime — ikut ter-deploy ke lokal & VPS. Untuk update
 * (mis. pemekaran), ganti file JSON di public/wilayah/ (lihat
 * scripts/build-wilayah.mjs).
 *
 * Memuat per-level (filter di klien). villages.json besar (~5MB) → hanya
 * diunduh saat tingkat kelurahan benar-benar dipakai, lalu di-cache.
 */

export interface WilayahItem {
  id: string;
  name: string;
}

interface ProvinceRow {
  id: string;
  name: string;
}
interface RegencyRow {
  id: string;
  province_id: string;
  name: string;
}
interface DistrictRow {
  id: string;
  regency_id: string;
  name: string;
}
interface VillageRow {
  id: string;
  district_id: string;
  name: string;
}

const BASE_PATH = '/wilayah';

// Cache per-file agar tidak fetch ulang dataset yang sama.
const fileCache = new Map<string, unknown>();

async function loadFile<T>(file: string): Promise<T> {
  const cached = fileCache.get(file);
  if (cached) return cached as T;
  const res = await fetch(`${BASE_PATH}/${file}`);
  if (!res.ok) throw new Error(`Gagal memuat data wilayah: ${file}`);
  const data = (await res.json()) as T;
  fileCache.set(file, data);
  return data;
}

export async function getProvinces(): Promise<WilayahItem[]> {
  const rows = await loadFile<ProvinceRow[]>('provinces.json');
  return rows.map((r) => ({ id: r.id, name: r.name }));
}

export async function getRegencies(provinceId: string): Promise<WilayahItem[]> {
  const rows = await loadFile<RegencyRow[]>('regencies.json');
  return rows.filter((r) => r.province_id === provinceId).map((r) => ({ id: r.id, name: r.name }));
}

export async function getDistricts(regencyId: string): Promise<WilayahItem[]> {
  const rows = await loadFile<DistrictRow[]>('districts.json');
  return rows.filter((r) => r.regency_id === regencyId).map((r) => ({ id: r.id, name: r.name }));
}

export async function getVillages(districtId: string): Promise<WilayahItem[]> {
  const rows = await loadFile<VillageRow[]>('villages.json');
  return rows.filter((r) => r.district_id === districtId).map((r) => ({ id: r.id, name: r.name }));
}
