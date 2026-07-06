/**
 * Daftar pekerjaan baku (mengikuti kuesioner survei nasional — Q "pekerjaan
 * utama"). Dipakai sebagai dropdown pada registrasi & profil agar konsisten &
 * mengurangi typo. Opsi terakhir "Lainnya" membuka isian teks bebas.
 */
export const OCCUPATIONS = [
  'Petani',
  'Peternak/Nelayan',
  'Buruh/Tukang (kayu, batu)',
  'Pedagang',
  'Jasa (Sopir, Laundry, ART, dll)',
  'Pengusaha',
  'PNS/ASN',
  'Pegawai swasta',
  'Pegawai honorer',
  'Tenaga Pengajar (Guru, Dosen, dll)',
  'Purnawirawan TNI/Polri',
  'Ibu rumah tangga',
  'Mahasiswa/Pelajar',
  'Tidak/belum bekerja',
  'Pensiunan',
] as const;

/** Nilai opsi "Lainnya" (memicu isian teks bebas). */
export const OCCUPATION_OTHER = 'Lainnya';

/** True bila sebuah nilai pekerjaan adalah entri bebas (bukan salah satu preset). */
export function isOtherOccupation(value: string | null | undefined): boolean {
  return !!value && !OCCUPATIONS.includes(value as (typeof OCCUPATIONS)[number]);
}
