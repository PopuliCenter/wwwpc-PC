import type { ConditionOperator, Question, QuestionType } from './surveyEditTypes';

/**
 * Metadata tipe pertanyaan untuk EDITOR survei: label ramah, pengelompokan
 * dropdown, default konfigurasi per tipe, dan label operator kondisi.
 */

export const questionTypeLabels: Record<QuestionType, string> = {
  single_choice: 'Pilihan Tunggal',
  multiple_choice: 'Pilihan Ganda',
  short_text: 'Teks Pendek',
  long_text: 'Teks Panjang',
  phone_number: 'No. Telepon',
  numeric_scale: 'Skala Angka',
  dropdown: 'Pilih dari Daftar',
  matrix_likert: 'Tabel Penilaian',
  file_upload: 'Unggah Berkas',
  date_time: 'Tanggal & Waktu',
  date: 'Tanggal',
  rating_scale: 'Bintang/Rating',
  unique_id: 'Nomor Unik',
  indonesia_region: 'Wilayah (Prov/Kab/Kec)',
  signature: 'Tanda Tangan',
  photo: 'Foto (Kamera)',
  gps: 'Titik GPS',
  audio: 'Rekaman Audio',
  random_arm: 'Penugasan Acak (Eksperimen)',
};

// Grup tipe untuk dropdown tambah/ubah pertanyaan. (gps & signature SENGAJA
// tak ada — kini setelan survei, bukan tipe pertanyaan.)
export const typeGroups: { label: string; types: QuestionType[] }[] = [
  { label: 'Pilihan', types: ['single_choice', 'multiple_choice', 'dropdown'] },
  { label: 'Teks', types: ['short_text', 'long_text'] },
  { label: 'Angka & Skala', types: ['numeric_scale', 'rating_scale'] },
  { label: 'Waktu', types: ['date', 'date_time'] },
  { label: 'Kontak & ID', types: ['phone_number', 'unique_id'] },
  { label: 'Lanjutan', types: ['matrix_likert', 'indonesia_region'] },
  { label: 'Media', types: ['photo', 'audio', 'file_upload'] },
  { label: 'Eksperimen', types: ['random_arm'] },
];

/** Default konfigurasi per tipe (opsi/aturan validasi). */
export function defaultsForType(type: QuestionType): Partial<Question> {
  if (type === 'single_choice' || type === 'multiple_choice' || type === 'dropdown') {
    return {
      options: [
        { id: `opt-${Date.now()}-1`, label: 'Opsi 1', value: 'option_1', order: 0 },
        { id: `opt-${Date.now()}-2`, label: 'Opsi 2', value: 'option_2', order: 1 },
      ],
    };
  }
  if (type === 'matrix_likert')
    return {
      validationRules: {
        matrixRows: ['Aspek 1'],
        matrixColumns: ['Sangat Setuju', 'Setuju', 'Tidak Setuju'],
      },
    };
  if (type === 'rating_scale')
    return { validationRules: { ratingMax: 5, ratingDisplayMode: 'star' } };
  if (type === 'numeric_scale') return { validationRules: { numericRange: { min: 1, max: 10 } } };
  if (type === 'indonesia_region') return { validationRules: { regionDepth: 'village' } };
  if (type === 'unique_id') return { validationRules: { minLength: 5, maxLength: 10 } };
  if (type === 'random_arm') {
    // Default 2 kelompok dengan KODE ANGKA (1, 2) — ramah SPSS.
    return {
      options: [
        { id: `arm-${Date.now()}-1`, label: 'Kelompok 1', value: '1', order: 0 },
        { id: `arm-${Date.now()}-2`, label: 'Kelompok 2', value: '2', order: 1 },
      ],
    };
  }
  return {};
}

export const operatorLabels: Record<ConditionOperator, string> = {
  equals: 'sama dengan (=)',
  not_equals: 'tidak sama dengan (≠)',
  contains: 'mengandung kata',
  greater_than: 'lebih besar dari (>)',
  less_than: 'lebih kecil dari (<)',
};
