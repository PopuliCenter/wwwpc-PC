/**
 * Util gaya bersama untuk komponen renderer pertanyaan (SurveyFillPage &
 * komponen renderer yang dipisah ke file sendiri). Dipisah agar tak duplikat.
 */

export const textFieldBase =
  'w-full rounded-lg border bg-white px-4 py-2.5 text-sm text-gray-900 shadow-sm transition-colors placeholder:text-gray-400 focus:outline-none focus:ring-2';

/** Kelas input teks/select, berubah warna bila `invalid`. */
export function fieldClasses(invalid?: boolean): string {
  return `${textFieldBase} ${
    invalid
      ? 'border-red-300 focus:border-red-400 focus:ring-red-500/40'
      : 'border-gray-300 hover:border-gray-400 focus:border-primary-500 focus:ring-primary-500/40'
  }`;
}
