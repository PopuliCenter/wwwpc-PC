/**
 * Util gaya bersama untuk komponen renderer pertanyaan (SurveyFillPage &
 * komponen renderer yang dipisah ke file sendiri). Dipisah agar tak duplikat.
 */
import { fieldClass } from '@/components/common/fieldStyles';

/** Kelas input teks/select/textarea, berubah warna bila `invalid`. */
export function fieldClasses(invalid?: boolean, multiline?: boolean): string {
  return fieldClass({ invalid, multiline });
}
