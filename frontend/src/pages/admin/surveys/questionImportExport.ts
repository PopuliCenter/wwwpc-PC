/**
 * Impor/ekspor PERTANYAAN survei via Excel (.xlsx) — agar admin bisa menyiapkan
 * banyak pertanyaan di spreadsheet lalu unggah, tanpa mengetik satu per satu.
 *
 * Cakupan (dasar): tipe, teks, wajib, opsi (dipisah "|"), opsi "Lainnya",
 * deskripsi. Konfigurasi lanjutan (cabang/skip, validasi, matriks, wilayah)
 * tetap diatur lewat UI editor setelah impor.
 *
 * Sepenuhnya sisi-klien (pakai exceljs, sama seperti ekspor responden). Tidak
 * mengubah backend: pertanyaan hasil impor masuk ke state editor untuk ditinjau,
 * baru disimpan lewat tombol Simpan biasa.
 */
import ExcelJS from 'exceljs';

/** Label ramah untuk tiap KODE tipe. Cermin dari questionTypeLabels di
 * SurveyEditPage — bila menambah tipe baru, perbarui keduanya. */
const TYPE_LABELS: Record<string, string> = {
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

/** Tipe yang memakai daftar OPSI. */
const OPTION_TYPES = new Set(['single_choice', 'multiple_choice', 'dropdown', 'random_arm']);

const VALID_CODES = Object.keys(TYPE_LABELS);
// Peta label(lowercase) → kode, untuk menerima input berupa label Indonesia.
const LABEL_TO_CODE = new Map(
  Object.entries(TYPE_LABELS).map(([code, label]) => [label.toLowerCase(), code]),
);

const HEADERS = [
  'Tipe',
  'Pertanyaan',
  'Wajib',
  'Opsi (pisahkan dengan |)',
  'Opsi Lainnya',
  'Deskripsi',
] as const;

/** Pertanyaan hasil impor (bentuk minimal; editor melengkapi id/order/dll). */
export interface ImportedQuestion {
  type: string;
  text: string;
  required: boolean;
  hasOtherOption: boolean;
  options: { label: string; value: string }[];
  description?: string;
}

/** Bentuk pertanyaan yang bisa diekspor (subset dari Question editor). */
export interface ExportableQuestion {
  type: string;
  text: string;
  required?: boolean;
  hasOtherOption?: boolean;
  options?: { label: string; value?: string }[];
  validationRules?: { description?: string } | null;
}

export interface ParseResult {
  questions: ImportedQuestion[];
  /** Catatan baris yang dilewati/masalah (ditampilkan ke admin). */
  errors: string[];
}

// ─── util ─────────────────────────────────────────────────────────────────────

async function downloadWorkbook(wb: ExcelJS.Workbook, filename: string): Promise<void> {
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Ambil teks dari sel exceljs (tangani rich text / hyperlink / formula). */
function cellText(cell: ExcelJS.Cell): string {
  const v = cell.value;
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    const o = v as unknown as Record<string, unknown>;
    if (typeof o.text === 'string') return o.text;
    if ('result' in o) return String(o.result ?? '');
    if (Array.isArray(o.richText)) {
      return (o.richText as { text?: string }[]).map((r) => r.text ?? '').join('');
    }
    return '';
  }
  return String(v);
}

/** Normalisasi kolom "Tipe": terima KODE (single_choice) atau LABEL (Pilihan Tunggal). */
function normalizeType(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const lower = t.toLowerCase();
  if (VALID_CODES.includes(lower)) return lower;
  return LABEL_TO_CODE.get(lower) ?? null;
}

/** Interpretasi kolom ya/tidak secara longgar. */
function isYes(raw: string): boolean {
  return ['ya', 'y', 'yes', 'true', '1', 'x', '✓', 'wajib'].includes(raw.trim().toLowerCase());
}

/** Ubah label opsi menjadi value ramah-mesin (slug); fallback ke label. */
function slugValue(label: string): string {
  const slug = label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return slug || label.trim();
}

function parseOptions(raw: string): { label: string; value: string }[] {
  return raw
    .split('|')
    .map((s) => s.trim())
    .filter((s) => s !== '')
    .map((label) => ({ label, value: slugValue(label) }));
}

// ─── ekspor ─────────────────────────────────────────────────────────────────

function styleHeader(ws: ExcelJS.Worksheet): void {
  const header = ws.getRow(1);
  header.font = { bold: true };
  header.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF2F2F2' } };
  });
}

function buildQuestionSheet(wb: ExcelJS.Workbook): ExcelJS.Worksheet {
  const ws = wb.addWorksheet('Pertanyaan');
  ws.columns = [
    { header: HEADERS[0], width: 22 },
    { header: HEADERS[1], width: 50 },
    { header: HEADERS[2], width: 10 },
    { header: HEADERS[3], width: 45 },
    { header: HEADERS[4], width: 14 },
    { header: HEADERS[5], width: 40 },
  ];
  return ws;
}

/** Lembar "Panduan": daftar kode tipe valid + apakah pakai opsi. */
function addGuideSheet(wb: ExcelJS.Workbook): void {
  const ws = wb.addWorksheet('Panduan');
  ws.columns = [
    { header: 'Kode Tipe', width: 22 },
    { header: 'Nama', width: 30 },
    { header: 'Pakai Opsi?', width: 14 },
  ];
  for (const [code, label] of Object.entries(TYPE_LABELS)) {
    ws.addRow([code, label, OPTION_TYPES.has(code) ? 'ya' : '-']);
  }
  styleHeader(ws);
  ws.addRow([]);
  ws.addRow(['Catatan:']);
  ws.addRow(['- Kolom "Tipe" boleh diisi KODE (single_choice) atau NAMA (Pilihan Tunggal).']);
  ws.addRow(['- Kolom "Opsi" hanya untuk tipe pilihan; pisahkan tiap opsi dengan tanda |.']);
  ws.addRow(['- Kolom "Wajib" & "Opsi Lainnya": isi "ya" atau kosongkan.']);
}

/** Unduh template kosong + contoh + panduan. */
export async function downloadQuestionTemplate(): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const ws = buildQuestionSheet(wb);
  ws.addRow(['single_choice', 'Apa jenis kelamin Anda?', 'ya', 'Laki-laki | Perempuan', '', '']);
  ws.addRow(['short_text', 'Sebutkan pekerjaan Anda', '', '', '', 'Isian bebas']);
  ws.addRow([
    'multiple_choice',
    'Media sosial yang dipakai?',
    '',
    'Instagram | TikTok | X',
    'ya',
    '',
  ]);
  styleHeader(ws);
  addGuideSheet(wb);
  await downloadWorkbook(wb, 'template-impor-pertanyaan.xlsx');
}

/** Ekspor pertanyaan survei saat ini ke Excel. */
export async function exportQuestions(
  questions: ExportableQuestion[],
  surveyTitle: string,
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const ws = buildQuestionSheet(wb);
  for (const q of questions) {
    ws.addRow([
      q.type,
      q.text ?? '',
      q.required ? 'ya' : '',
      OPTION_TYPES.has(q.type) ? (q.options ?? []).map((o) => o.label).join(' | ') : '',
      q.hasOtherOption ? 'ya' : '',
      q.validationRules?.description ?? '',
    ]);
  }
  styleHeader(ws);
  addGuideSheet(wb);
  const safe =
    surveyTitle
      .trim()
      .replace(/[^a-z0-9]+/gi, '-')
      .replace(/^-+|-+$/g, '') || 'survei';
  await downloadWorkbook(wb, `pertanyaan-${safe.toLowerCase()}.xlsx`);
}

// ─── impor ─────────────────────────────────────────────────────────────────

/** Baca file .xlsx → daftar pertanyaan + catatan baris bermasalah. */
export async function parseQuestionsFile(file: File): Promise<ParseResult> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(await file.arrayBuffer());
  const ws = wb.worksheets[0];
  if (!ws) return { questions: [], errors: ['File kosong / tidak ada lembar kerja.'] };

  const questions: ImportedQuestion[] = [];
  const errors: string[] = [];

  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) return; // header

    const typeRaw = cellText(row.getCell(1));
    const text = cellText(row.getCell(2)).trim();
    // Lewati baris kosong (tak ada tipe & tak ada teks) tanpa catatan.
    if (!typeRaw.trim() && !text) return;

    const type = normalizeType(typeRaw);
    if (!type) {
      errors.push(`Baris ${rowNum}: tipe "${typeRaw}" tidak dikenal — dilewati.`);
      return;
    }
    if (!text) {
      errors.push(`Baris ${rowNum}: kolom Pertanyaan kosong — dilewati.`);
      return;
    }

    const options = OPTION_TYPES.has(type) ? parseOptions(cellText(row.getCell(4))) : [];
    if (OPTION_TYPES.has(type) && options.length === 0) {
      errors.push(
        `Baris ${rowNum}: tipe pilihan tapi kolom Opsi kosong — opsi bisa dilengkapi nanti.`,
      );
    }

    questions.push({
      type,
      text,
      required: isYes(cellText(row.getCell(3))),
      hasOtherOption: isYes(cellText(row.getCell(5))),
      options,
      description: cellText(row.getCell(6)).trim() || undefined,
    });
  });

  if (questions.length === 0 && errors.length === 0) {
    errors.push('Tidak ada baris pertanyaan yang terbaca.');
  }
  return { questions, errors };
}
