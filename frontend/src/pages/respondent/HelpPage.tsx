import { useState } from 'react';
import { ChevronDown, Mail, Globe, LifeBuoy } from 'lucide-react';

// Ganti sesuai kontak dukungan resmi Populi Center bila perlu.
const SUPPORT = {
  email: 'info@populicenter.org',
  website: 'https://populicenter.org',
};

const FAQS: { q: string; a: string }[] = [
  {
    q: 'Bagaimana cara mendapatkan poin?',
    a: 'Anda mendapat poin saat mendaftar, melengkapi data diri, dan setiap kali menyelesaikan survei. Jumlah poin tiap survei ditentukan oleh tim survei dan tampil di daftar survei.',
  },
  {
    q: 'Bagaimana cara menukar poin?',
    a: 'Buka tab Reward → pilih Pulsa atau E-Wallet → tekan Tukar → masukkan nomor tujuan → konfirmasi. Poin akan terpotong sesuai nilai reward.',
  },
  {
    q: 'Poin saya belum bertambah setelah mengisi survei.',
    a: 'Poin biasanya masuk segera setelah survei terkirim. Jika belum, tarik untuk menyegarkan atau buka tab Reward — saldo akan diperbarui. Pastikan koneksi internet aktif saat mengirim jawaban.',
  },
  {
    q: 'Pulsa/e-wallet belum saya terima.',
    a: 'Penukaran diproses otomatis. Cek status di Reward → Riwayat Penukaran. Untuk pulsa, gunakan nomor PRABAYAR (nomor pascabayar tidak bisa diisi). Bila gagal, poin otomatis dikembalikan.',
  },
  {
    q: 'Bagaimana mengubah data diri saya?',
    a: 'Buka tab Profil. Sebagian data (tanggal lahir, jenis kelamin, wilayah KTP) dikunci untuk menjaga kualitas data; domisili terkini akan ditanyakan langsung di survei bila diperlukan.',
  },
  {
    q: 'Apakah data saya aman?',
    a: 'Ya. Identitas dan lokasi Anda hanya digunakan untuk keperluan riset dan tidak diperjualbelikan.',
  },
];

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg border border-gray-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm font-medium text-gray-800"
      >
        <span>{q}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <p className="px-4 pb-3 text-sm leading-relaxed text-gray-600">{a}</p>}
    </div>
  );
}

export function HelpPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100 text-primary-600">
          <LifeBuoy className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Bantuan &amp; Dukungan</h1>
          <p className="text-sm text-gray-500">Pertanyaan umum dan cara menghubungi kami.</p>
        </div>
      </div>

      {/* FAQ */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">
          Pertanyaan yang sering diajukan
        </h2>
        {FAQS.map((f) => (
          <FaqItem key={f.q} q={f.q} a={f.a} />
        ))}
      </section>

      {/* Kontak */}
      <section className="rounded-xl border border-gray-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-gray-800">Masih butuh bantuan?</h2>
        <div className="space-y-2">
          <a
            href={`mailto:${SUPPORT.email}`}
            className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2.5 text-sm hover:bg-gray-50"
          >
            <Mail className="h-4 w-4 text-primary-600" />
            <span className="text-gray-700">{SUPPORT.email}</span>
          </a>
          <a
            href={SUPPORT.website}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-lg border border-gray-200 px-3 py-2.5 text-sm hover:bg-gray-50"
          >
            <Globe className="h-4 w-4 text-primary-600" />
            <span className="text-gray-700">{SUPPORT.website.replace(/^https?:\/\//, '')}</span>
          </a>
        </div>
        <p className="mt-3 text-xs text-gray-400">
          Sertakan email akun &amp; deskripsi masalah agar kami bisa membantu lebih cepat.
        </p>
      </section>
    </div>
  );
}
