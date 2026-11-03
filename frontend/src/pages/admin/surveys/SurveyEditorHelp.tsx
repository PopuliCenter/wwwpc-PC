/**
 * Panduan (tutorial) singkat di dalam editor survei: menjelaskan pertanyaan
 * bercabang (Aturan Tampil), lompat/skip, kelompok eksperimen (Penugasan Acak),
 * impor/ekspor, dan tips. Ditampilkan sebagai modal dari tombol "Panduan".
 */
import type { ReactNode } from 'react';
import { ChevronDown, X } from 'lucide-react';
import { Button } from '@/components/common/Button';
import { IconButton } from '@/components/common/IconButton';
import { ModalShell } from '@/components/common/ModalShell';
import { Notice } from '@/components/common/Notice';

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group rounded-lg border border-gray-200 bg-white [&_summary]:marker:content-['']">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-4 py-2.5 text-sm font-semibold text-gray-900 hover:bg-gray-50">
        {title}
        <ChevronDown
          className="h-4 w-4 shrink-0 text-gray-600 transition-transform group-open:rotate-180"
          strokeWidth={1.75}
          aria-hidden="true"
        />
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
    <ModalShell label="Panduan" onClose={onClose}>
      <div className="flex items-center justify-between gap-2 border-b border-gray-200 px-4 py-2 sm:px-5">
        <h3 className="text-base font-semibold text-gray-900">
          Panduan: percabangan, skip & kelompok eksperimen
        </h3>
        <IconButton aria-label="Tutup" onClick={onClose}>
          <X className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </IconButton>
      </div>

      <div className="space-y-3 p-4">
        <Section title="1. Alur dasar">
          <ol className="space-y-1">
            <Step>
              Tambah pertanyaan lewat <b>Tambah Pertanyaan</b> atau <b>Unggah</b> (file Excel).
            </Step>
            <Step>
              Klik <b>Edit</b> pada sebuah pertanyaan → muncul 3 tab: <b>Pertanyaan</b> (teks, tipe,
              opsi), <b>Aturan Tampil</b> (percabangan & skip), <b>Batasan Isian</b> (validasi).
            </Step>
            <Step>
              Selalu klik <b>Simpan</b> di kanan atas agar perubahan tersimpan.
            </Step>
          </ol>
        </Section>

        <Section title="2. Pertanyaan bercabang">
          <p>
            Gunakan agar sebuah pertanyaan <b>hanya muncul</b> jika jawaban pertanyaan lain memenuhi
            syarat. Buka pertanyaan → tab <b>Aturan Tampil</b> → bagian <b>“Tampilkan otomatis”</b>{' '}
            → <b>Tambah Aturan</b>.
          </p>
          <p className="font-medium text-gray-800">Contoh:</p>
          <p>
            Pertanyaan “Partai oposisi yang cocok?” hanya untuk yang menjawab perlu oposisi. Setel
            di pertanyaan itu:
          </p>
          <p>
            <Rule text="Jika [Perlu oposisi?] = Ya, perlu ada oposisi → Tampilkan pertanyaan ini" />
          </p>
          <p>
            <b>Operator</b> yang tersedia: sama dengan, tidak sama dengan, mengandung kata, lebih
            besar dari, lebih kecil dari. Untuk pertanyaan pilihan, kolom <b>Nilai</b> berupa daftar
            opsi sumber (tinggal pilih).
          </p>
        </Section>

        <Section title="3. Lompat dan sembunyikan">
          <p>
            Di tab <b>Aturan Tampil</b> yang sama, bagian <b>“Sembunyikan otomatis”</b>. Dua pilihan
            aksi:
          </p>
          <ul className="ml-4 list-disc space-y-1">
            <li>
              <b>Sembunyikan pertanyaan ini</b> — pertanyaan hilang jika kondisi terpenuhi.
            </li>
            <li>
              <b>Lompat ke pertanyaan lain</b> — melewati beberapa pertanyaan menuju tujuan.
            </li>
          </ul>
          <Notice>
            Beda dengan Aturan Tampil: <b>Tampilkan otomatis</b> = MUNCUL bila syarat benar;{' '}
            <b>Sembunyikan otomatis</b> = HILANG bila syarat benar. Pilih satu gaya yang paling
            mudah Anda pikirkan — jangan pakai keduanya untuk pertanyaan yang sama.
          </Notice>
        </Section>

        <Section title="4. Kelompok eksperimen">
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
          <p className="text-xs text-gray-600">
            Hasil: tiap responden hanya melihat 1 varian. Bandingkan jawaban antar-kelompok untuk
            mengukur efek framing.
          </p>
        </Section>

        <Section title="5. Impor dan ekspor Excel">
          <p>
            Tombol <b>Template</b> (contoh format), <b>Unduh</b> (ekspor pertanyaan), dan{' '}
            <b>Unggah</b> (impor). Kolom: <b>Tipe</b>, <b>Pertanyaan</b>, <b>Wajib</b>, <b>Opsi</b>{' '}
            (pisahkan dengan tanda <Rule text="|" />
            ), <b>Opsi Lainnya</b>, <b>Deskripsi</b>.
          </p>
          <Notice>
            Percabangan (Aturan Tampil/Skip) & konfigurasi matriks <b>tidak bisa</b> dititipkan
            lewat Excel — impor dulu, lalu setel percabangannya manual di editor (lihat bagian
            Pertanyaan bercabang, Lompat dan sembunyikan, serta Kelompok eksperimen).
          </Notice>
        </Section>

        <Section title="6. Tips">
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
              Ubah urutan pertanyaan dengan <b>menyeret</b> (drag) ikon geser di kiri kartu.
            </li>
          </ul>
        </Section>
      </div>

      <div className="flex justify-end border-t border-gray-200 px-4 py-3 sm:px-5">
        <Button type="button" onClick={onClose}>
          Mengerti
        </Button>
      </div>
    </ModalShell>
  );
}
