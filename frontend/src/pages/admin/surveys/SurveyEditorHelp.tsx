/**
 * Panduan (tutorial) singkat di dalam editor survei: menjelaskan pertanyaan
 * bercabang (Aturan Tampil), lompat/skip, kelompok eksperimen (Penugasan Acak),
 * impor/ekspor, dan tips. Ditampilkan sebagai modal dari tombol "Panduan".
 */
import type { ReactNode } from 'react';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="rounded-lg border border-gray-200 bg-white [&_summary]:marker:content-['']">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-gray-900 hover:bg-gray-50">
        {title}
      </summary>
      <div className="space-y-2 border-t border-gray-100 px-4 py-3 text-sm leading-relaxed text-gray-700">
        {children}
      </div>
    </details>
  );
}

function Step({ children }: { children: ReactNode }) {
  return <li className="ml-4 list-decimal">{children}</li>;
}

/** Contoh visual "Jika [X] = [nilai] → aksi". */
function Rule({ text }: { text: string }) {
  return (
    <span className="inline-block rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs text-gray-800">
      {text}
    </span>
  );
}

export function SurveyEditorHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="my-6 w-full max-w-2xl rounded-lg bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-3">
          <h3 className="text-base font-semibold text-gray-900">
            📘 Panduan: percabangan, skip & kelompok eksperimen
          </h3>
          <button
            onClick={onClose}
            className="text-lg leading-none text-gray-400 hover:text-gray-600"
            aria-label="Tutup"
          >
            ✕
          </button>
        </div>

        <div className="space-y-3 p-4">
          <Section title="① Alur dasar mengisi pertanyaan">
            <ol className="space-y-1">
              <Step>
                Tambah pertanyaan lewat <b>+ Tambah Pertanyaan</b> atau <b>Unggah</b> (file Excel).
              </Step>
              <Step>
                Klik <b>Edit</b> pada sebuah pertanyaan → muncul 3 tab: <b>✏️ Pertanyaan</b> (teks,
                tipe, opsi), <b>Aturan Tampil</b> (percabangan & skip), <b>Batasan Isian</b>{' '}
                (validasi).
              </Step>
              <Step>
                Selalu klik <b>Simpan</b> di kanan atas agar perubahan tersimpan.
              </Step>
            </ol>
          </Section>

          <Section title="② Pertanyaan bercabang — Aturan Tampil (tampil/sembunyi berdasarkan jawaban lain)">
            <p>
              Gunakan agar sebuah pertanyaan <b>hanya muncul</b> jika jawaban pertanyaan lain
              memenuhi syarat. Buka pertanyaan → tab <b>Aturan Tampil</b> → bagian{' '}
              <b>“Tampilkan otomatis”</b> → <b>+ Tambah Aturan</b>.
            </p>
            <p className="font-medium text-gray-800">Contoh:</p>
            <p>
              Pertanyaan <i>“Partai oposisi yang cocok?”</i> hanya untuk yang menjawab perlu
              oposisi. Setel di pertanyaan itu:
            </p>
            <p>
              <Rule text="Jika [Perlu oposisi?] = Ya, perlu ada oposisi → Tampilkan pertanyaan ini" />
            </p>
            <p>
              <b>Operator</b> yang tersedia: sama dengan, tidak sama dengan, mengandung kata, lebih
              besar dari, lebih kecil dari. Untuk pertanyaan pilihan, kolom <b>Nilai</b> berupa
              daftar opsi sumber (tinggal pilih).
            </p>
          </Section>

          <Section title="③ Lompat / Sembunyikan otomatis (Skip logic)">
            <p>
              Di tab <b>Aturan Tampil</b> yang sama, bagian <b>“Sembunyikan otomatis”</b>. Dua
              pilihan aksi:
            </p>
            <ul className="ml-4 list-disc space-y-1">
              <li>
                <b>Sembunyikan pertanyaan ini</b> — pertanyaan hilang jika kondisi terpenuhi.
              </li>
              <li>
                <b>Lompat ke pertanyaan lain</b> — melewati beberapa pertanyaan menuju tujuan.
              </li>
            </ul>
            <p className="rounded-md bg-amber-50 p-2 text-xs text-amber-800">
              Beda dengan Aturan Tampil: <b>Tampilkan otomatis</b> = MUNCUL bila syarat benar;{' '}
              <b>Sembunyikan otomatis</b> = HILANG bila syarat benar. Pilih satu gaya yang paling
              mudah Anda pikirkan — jangan pakai keduanya untuk pertanyaan yang sama.
            </p>
          </Section>

          <Section title="④ Kelompok eksperimen — Penugasan Acak (split-ballot)">
            <p>
              Tipe pertanyaan <b>“Penugasan Acak (Eksperimen)”</b>. Sistem <b>mengundi</b> satu
              kelompok untuk tiap responden (peluang sama rata) dan pertanyaan ini{' '}
              <b>tidak ditampilkan</b> ke responden. Tiap kelompok punya <b>kode</b> (mis.{' '}
              <Rule text="gender" /> <Rule text="umur" /> <Rule text="partai" /> atau angka 1, 2, 3
              yang ramah SPSS).
            </p>
            <p className="font-medium text-gray-800">Cara membuat cabang per kelompok:</p>
            <ol className="space-y-1">
              <Step>Buat 1 pertanyaan Penugasan Acak, isi kelompok + kodenya.</Step>
              <Step>
                Buat pertanyaan <b>varian</b> untuk tiap kelompok (boleh mirip, beda framing).
              </Step>
              <Step>
                Pada tiap varian → tab <b>Aturan Tampil</b> → setel{' '}
                <Rule text="Tampilkan jika [Penugasan Acak] = kode kelompok" />.
              </Step>
            </ol>
            <p className="font-medium text-gray-800">Contoh (modul Capres 2029):</p>
            <ul className="ml-4 list-disc space-y-1">
              <li>
                <Rule text="E0 Kelompok Eksperimen" /> mengundi: gender / umur / partai.
              </li>
              <li>
                <Rule text="E1 [PRIME GENDER] → tampil jika E0 = gender" />
              </li>
              <li>
                <Rule text="E2 [PRIME UMUR] → tampil jika E0 = umur" />
              </li>
              <li>
                <Rule text="E3 [PRIME PARTAI] → tampil jika E0 = partai" />
              </li>
            </ul>
            <p className="text-xs text-gray-500">
              Hasil: tiap responden hanya melihat 1 varian. Bandingkan jawaban antar-kelompok untuk
              mengukur efek framing.
            </p>
          </Section>

          <Section title="⑤ Impor & Ekspor pertanyaan (Excel)">
            <p>
              Tombol <b>Template</b> (contoh format), <b>Unduh</b> (ekspor pertanyaan), dan{' '}
              <b>Unggah</b> (impor). Kolom: <b>Tipe</b>, <b>Pertanyaan</b>, <b>Wajib</b>,{' '}
              <b>Opsi</b> (pisahkan dengan tanda <Rule text="|" />
              ), <b>Opsi Lainnya</b>, <b>Deskripsi</b>.
            </p>
            <p className="rounded-md bg-blue-50 p-2 text-xs text-blue-800">
              Percabangan (Aturan Tampil/Skip) & konfigurasi matriks <b>tidak bisa</b> dititipkan
              lewat Excel — impor dulu, lalu setel percabangannya manual di editor (lihat bagian ②–
              ④).
            </p>
          </Section>

          <Section title="⑥ Tips singkat">
            <ul className="ml-4 list-disc space-y-1">
              <li>
                <b>Opsi “Lainnya”</b> menambah kotak isian teks bebas di bawah pilihan.
              </li>
              <li>
                <b>Matriks skala 1–10</b> (mis. menilai banyak tokoh/lembaga): buat beberapa
                pertanyaan <b>Skala Angka</b>, satu per item.
              </li>
              <li>
                <b>Wajib</b> menandai pertanyaan harus diisi sebelum responden bisa lanjut.
              </li>
              <li>
                Ubah urutan pertanyaan dengan <b>menyeret</b> (drag) ikon titik-titik di kiri kartu.
              </li>
            </ul>
          </Section>
        </div>

        <div className="border-t border-gray-100 px-5 py-3 text-right">
          <button
            onClick={onClose}
            className="rounded-md bg-primary-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-700"
          >
            Mengerti
          </button>
        </div>
      </div>
    </div>
  );
}
