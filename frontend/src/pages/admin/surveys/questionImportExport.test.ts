import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { parseQuestionsFile } from './questionImportExport';

/** Bangun File .xlsx dari baris-baris (baris 1 = header) untuk diuji parse. */
async function makeXlsx(rows: (string | number)[][]): Promise<File> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Pertanyaan');
  ws.addRow([
    'Tipe',
    'Pertanyaan',
    'Wajib',
    'Opsi (pisahkan dengan |)',
    'Opsi Lainnya',
    'Deskripsi',
  ]);
  for (const r of rows) ws.addRow(r);
  const buf = await wb.xlsx.writeBuffer();
  // jsdom File tidak mengimplementasi arrayBuffer(); parseQuestionsFile hanya
  // memakai itu, jadi cukup sediakan File-palsu dengan arrayBuffer().
  return { arrayBuffer: async () => buf } as unknown as File;
}

describe('parseQuestionsFile', () => {
  it('membaca tipe (kode/label), opsi, wajib, opsi-lainnya, deskripsi', async () => {
    const file = await makeXlsx([
      ['single_choice', 'Jenis kelamin?', 'ya', 'Laki-laki | Perempuan', '', 'wajib diisi'],
      ['Pilihan Ganda', 'Media sosial?', '', 'IG | TikTok', 'ya', ''],
      ['short_text', 'Pekerjaan?', 'tidak', '', '', ''],
    ]);
    const { questions, errors } = await parseQuestionsFile(file);
    expect(errors).toHaveLength(0);
    expect(questions).toHaveLength(3);

    expect(questions[0]).toMatchObject({
      type: 'single_choice',
      text: 'Jenis kelamin?',
      required: true,
      hasOtherOption: false,
      description: 'wajib diisi',
    });
    expect(questions[0].options.map((o) => o.label)).toEqual(['Laki-laki', 'Perempuan']);
    expect(questions[0].options[0].value).toBe('laki_laki'); // slug

    // Label Indonesia dinormalkan ke kode
    expect(questions[1].type).toBe('multiple_choice');
    expect(questions[1].hasOtherOption).toBe(true);
    expect(questions[1].options.map((o) => o.label)).toEqual(['IG', 'TikTok']);

    // Tipe non-opsi → tanpa opsi
    expect(questions[2].type).toBe('short_text');
    expect(questions[2].required).toBe(false);
    expect(questions[2].options).toHaveLength(0);
  });

  it('melewati baris kosong tanpa catatan, dan mencatat tipe tak dikenal / teks kosong', async () => {
    const file = await makeXlsx([
      ['', '', '', '', '', ''], // kosong → dilewati diam
      ['tipe_ngawur', 'Halo?', '', '', '', ''], // tipe tak dikenal
      ['short_text', '', '', '', '', ''], // teks kosong
    ]);
    const { questions, errors } = await parseQuestionsFile(file);
    expect(questions).toHaveLength(0);
    // Dua catatan: tipe tak dikenal + teks kosong (baris kosong TIDAK dicatat)
    expect(errors.length).toBe(2);
    expect(errors.some((e) => e.includes('tidak dikenal'))).toBe(true);
    expect(errors.some((e) => e.includes('Pertanyaan kosong'))).toBe(true);
  });

  it('mencatat bila tipe pilihan tanpa opsi, tapi tetap mengimpor', async () => {
    const file = await makeXlsx([['dropdown', 'Kota domisili?', '', '', '', '']]);
    const { questions, errors } = await parseQuestionsFile(file);
    expect(questions).toHaveLength(1);
    expect(questions[0].options).toHaveLength(0);
    expect(errors.some((e) => e.includes('Opsi kosong'))).toBe(true);
  });
});
