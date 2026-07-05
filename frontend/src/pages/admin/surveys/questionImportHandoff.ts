/**
 * Serah-terima impor pertanyaan dari daftar survei → halaman editor.
 *
 * Saat admin mengunggah file dari HALAMAN DAFTAR, file di-parse di sana lalu
 * hasilnya "dititipkan" di sini, dan aplikasi berpindah ke editor. Editor
 * mengambil titipan ini saat dimuat, menambahkannya ke pertanyaan yang ada,
 * dan admin meninjau lalu menyimpan lewat tombol Simpan biasa.
 *
 * Kenapa lewat editor, bukan simpan langsung dari daftar? Menyimpan pertanyaan
 * = PUT seluruh daftar (jalur yang sama dgn edit manual) → semantik simpan yang
 * sudah teruji terjaga, dan pertanyaan lama (yang mungkin sudah punya respons)
 * tidak berisiko rusak.
 *
 * Disimpan di variabel modul (bukan sessionStorage): navigasi antar-halaman di
 * SPA tidak me-reload modul, jadi titipan bertahan; sekali diambil langsung
 * dihapus (idempoten).
 */
import type { ImportedQuestion } from './questionImportExport';

let pending: { surveyId: string; questions: ImportedQuestion[] } | null = null;

/** Titipkan pertanyaan hasil parse untuk survei tertentu. */
export function setPendingImport(surveyId: string, questions: ImportedQuestion[]): void {
  pending = { surveyId, questions };
}

/** Ambil (sekali) titipan untuk survei tertentu; null bila tak ada. */
export function takePendingImport(surveyId: string): ImportedQuestion[] | null {
  if (pending && pending.surveyId === surveyId) {
    const q = pending.questions;
    pending = null;
    return q;
  }
  return null;
}
