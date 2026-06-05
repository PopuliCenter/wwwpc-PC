/**
 * Layanan data wilayah Indonesia.
 * Mengambil data provinsi, kabupaten/kota, kecamatan, dan kelurahan
 * dari API publik Kemendagri (emsifa.github.io/api-wilayah-indonesia).
 * Gunakan file wilayahIndonesia.json (dari repo referensi) untuk mode offline.
 */

export interface WilayahItem {
  id: string;
  name: string;
}

const BASE_URL = 'https://emsifa.github.io/api-wilayah-indonesia/api';

// Cache sederhana agar tidak fetch ulang untuk data yang sama
const cache = new Map<string, WilayahItem[]>();

async function fetchWilayah(url: string): Promise<WilayahItem[]> {
  if (cache.has(url)) return cache.get(url)!;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gagal memuat data wilayah: ${res.statusText}`);
  const data: Array<{ id: string; name: string }> = await res.json();
  const items = data.map((d) => ({ id: d.id, name: d.name }));
  cache.set(url, items);
  return items;
}

export async function getProvinces(): Promise<WilayahItem[]> {
  return fetchWilayah(`${BASE_URL}/provinces.json`);
}

export async function getRegencies(provinceId: string): Promise<WilayahItem[]> {
  return fetchWilayah(`${BASE_URL}/regencies/${provinceId}.json`);
}

export async function getDistricts(regencyId: string): Promise<WilayahItem[]> {
  return fetchWilayah(`${BASE_URL}/districts/${regencyId}.json`);
}

export async function getVillages(districtId: string): Promise<WilayahItem[]> {
  return fetchWilayah(`${BASE_URL}/villages/${districtId}.json`);
}
