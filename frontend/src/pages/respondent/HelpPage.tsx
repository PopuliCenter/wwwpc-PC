import { useMemo, useState } from 'react';
import {
  ChevronDown,
  Mail,
  Globe,
  MessageCircle,
  Sparkles,
  Search,
  Coins,
  ArrowRightLeft,
  Clock,
  Smartphone,
  UserCog,
  ShieldCheck,
  SendHorizontal,
  type LucideIcon,
} from 'lucide-react';
import { api } from '@/services/api';

// Ganti sesuai kontak dukungan resmi Populi Center bila perlu.
const SUPPORT = {
  email: 'info@populicenter.org',
  website: 'https://populicenter.org',
  // Format internasional tanpa '+' untuk tautan wa.me (0812... → 62812...).
  whatsapp: '6281292068362',
  whatsappDisplay: '0812-9206-8362',
};

const waLink = (text: string) =>
  `https://wa.me/${SUPPORT.whatsapp}?text=${encodeURIComponent(text)}`;

interface Faq {
  q: string;
  a: string;
  icon: LucideIcon;
  keywords: string;
}

const FAQS: Faq[] = [
  {
    q: 'Bagaimana cara mendapatkan poin?',
    a: 'Anda mendapat poin saat mendaftar, melengkapi data diri, dan setiap kali menyelesaikan survei. Jumlah poin tiap survei ditentukan oleh tim survei dan tampil di daftar survei.',
    icon: Coins,
    keywords: 'poin point dapat hadiah reward survei isi',
  },
  {
    q: 'Bagaimana cara menukar poin?',
    a: 'Buka tab Reward → pilih Pulsa atau E-Wallet → tekan Tukar → masukkan nomor tujuan → konfirmasi. Poin akan terpotong sesuai nilai reward.',
    icon: ArrowRightLeft,
    keywords: 'tukar redeem pulsa ewallet e-wallet gopay ovo dana poin',
  },
  {
    q: 'Poin saya belum bertambah setelah mengisi survei.',
    a: 'Poin biasanya masuk segera setelah survei terkirim. Jika belum, tarik untuk menyegarkan atau buka tab Reward — saldo akan diperbarui. Pastikan koneksi internet aktif saat mengirim jawaban.',
    icon: Clock,
    keywords: 'poin belum bertambah masuk gagal saldo survei selesai',
  },
  {
    q: 'Pulsa/e-wallet belum saya terima.',
    a: 'Penukaran diproses otomatis. Cek status di Reward → Riwayat Penukaran. Untuk pulsa, gunakan nomor PRABAYAR (nomor pascabayar tidak bisa diisi). Bila gagal, poin otomatis dikembalikan.',
    icon: Smartphone,
    keywords: 'pulsa ewallet e-wallet belum terima gagal gopay ovo dana prabayar refund',
  },
  {
    q: 'Bagaimana mengubah data diri saya?',
    a: 'Buka tab Profil → Ubah Data Diri. Sebagian data (tanggal lahir, jenis kelamin, wilayah KTP) dikunci untuk menjaga kualitas data; domisili terkini akan ditanyakan langsung di survei bila diperlukan.',
    icon: UserCog,
    keywords: 'data diri profil ubah edit nama telepon email wilayah',
  },
  {
    q: 'Apakah data saya aman?',
    a: 'Ya. Identitas dan lokasi Anda hanya digunakan untuk keperluan riset dan tidak diperjualbelikan. Lihat Kebijakan Privasi di menu Profil.',
    icon: ShieldCheck,
    keywords: 'aman privasi keamanan data lokasi gps identitas',
  },
];

const SUGGESTIONS = ['Cara dapat poin', 'Tukar poin', 'Pulsa belum masuk', 'Ubah data diri'];

function FaqItem({ faq, defaultOpen }: { faq: Faq; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(Boolean(defaultOpen));
  const Icon = faq.icon;
  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm transition-shadow hover:shadow-md">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-600">
          <Icon className="h-4 w-4" />
        </span>
        <span className="flex-1 text-sm font-medium text-gray-800">{faq.q}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && <p className="px-4 pb-4 pl-16 text-sm leading-relaxed text-gray-600">{faq.a}</p>}
    </div>
  );
}

export function HelpPage() {
  const [query, setQuery] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiAnswer, setAiAnswer] = useState<string | null>(null);
  const [aiUnavailable, setAiUnavailable] = useState(false);

  const askAi = async () => {
    const q = query.trim();
    if (!q || aiLoading) return;
    setAiLoading(true);
    setAiAnswer(null);
    setAiUnavailable(false);
    try {
      const res = await api.post<{ answer: string | null; configured: boolean }>('/assistant/ask', {
        question: q,
      });
      if (!res.configured || !res.answer) setAiUnavailable(true);
      else setAiAnswer(res.answer);
    } catch {
      setAiUnavailable(true);
    } finally {
      setAiLoading(false);
    }
  };

  // Reset jawaban AI saat pertanyaan berubah.
  const onQueryChange = (v: string) => {
    setQuery(v);
    setAiAnswer(null);
    setAiUnavailable(false);
  };

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return FAQS;
    const tokens = q.split(/\s+/).filter(Boolean);
    return FAQS.filter((f) => {
      const hay = `${f.q} ${f.a} ${f.keywords}`.toLowerCase();
      return tokens.some((t) => hay.includes(t));
    });
  }, [query]);

  const searching = query.trim().length > 0;
  const noResult = searching && results.length === 0;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Hero asisten */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-indigo-600 via-primary-600 to-violet-600 p-6 text-white shadow-sm">
        <Sparkles className="pointer-events-none absolute -right-4 -top-4 h-24 w-24 text-white/10" />
        <div className="relative">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-semibold backdrop-blur">
            <Sparkles className="h-3 w-3" /> Asisten Bantuan
          </div>
          <h1 className="mt-3 text-2xl font-bold leading-tight">Ada yang bisa kami bantu?</h1>
          <p className="mt-1 text-sm text-white/80">
            Ketik pertanyaanmu, kami bantu temukan jawabannya.
          </p>

          {/* Kotak tanya */}
          <div className="mt-4 flex items-center gap-2 rounded-2xl bg-white p-1.5 shadow-sm">
            <Search className="ml-2 h-5 w-5 shrink-0 text-gray-400" />
            <input
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Tanya apa saja… (mis. cara tukar poin)"
              className="min-w-0 flex-1 bg-transparent py-2 text-sm text-gray-800 placeholder:text-gray-400 focus:outline-none"
            />
            {query && (
              <button
                type="button"
                onClick={() => onQueryChange('')}
                className="rounded-lg px-2 py-1 text-xs font-medium text-gray-400 hover:text-gray-600"
              >
                Hapus
              </button>
            )}
          </div>

          {/* Chip saran */}
          <div className="mt-3 flex flex-wrap gap-2">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => onQueryChange(s)}
                className="rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white backdrop-blur transition-colors hover:bg-white/25"
              >
                {s}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Hasil / FAQ */}
      <section className="space-y-2.5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-400">
          {searching ? `Hasil untuk “${query.trim()}”` : 'Pertanyaan yang sering diajukan'}
        </h2>

        {!noResult &&
          results.map((f) => (
            <FaqItem key={f.q} faq={f} defaultOpen={searching && results.length === 1} />
          ))}

        {/* Asisten AI (fallback) — hanya saat sedang mencari */}
        {searching && (
          <div className="space-y-3 pt-1">
            {!aiLoading && !aiAnswer && !aiUnavailable && (
              <button
                type="button"
                onClick={askAi}
                className="flex w-full items-center justify-center gap-2 rounded-2xl border border-primary-200 bg-primary-50 px-4 py-3 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-100"
              >
                <Sparkles className="h-4 w-4" />
                {noResult ? 'Belum ketemu — Tanya Asisten AI' : 'Masih bingung? Tanya Asisten AI'}
              </button>
            )}

            {aiLoading && (
              <div className="flex items-center gap-3 rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-primary-600">
                  <Sparkles className="h-4 w-4" />
                </span>
                <span className="text-sm text-gray-500">
                  Asisten sedang mengetik<span className="animate-pulse">…</span>
                </span>
              </div>
            )}

            {aiAnswer && (
              <div className="rounded-2xl border border-primary-100 bg-white p-4 shadow-sm">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-primary-600">
                  <Sparkles className="h-3.5 w-3.5" /> Asisten Populi
                </div>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-gray-700">
                  {aiAnswer}
                </p>
                <div className="mt-3 flex items-center justify-between gap-2 border-t border-gray-100 pt-2">
                  <span className="text-[11px] text-gray-400">
                    Jawaban AI bisa keliru — untuk hal terkait akun/poin, hubungi tim kami.
                  </span>
                  <a
                    href={waLink(`Halo Populi, saya butuh bantuan: ${query.trim()}`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
                  >
                    <MessageCircle className="h-3.5 w-3.5" /> WhatsApp
                  </a>
                </div>
              </div>
            )}

            {aiUnavailable && (
              <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-5 text-center">
                <p className="text-sm text-gray-600">
                  Asisten AI sedang tidak tersedia. Tim kami siap membantu via WhatsApp.
                </p>
                <a
                  href={waLink(`Halo Populi, saya butuh bantuan: ${query.trim()}`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
                >
                  <SendHorizontal className="h-4 w-4" /> Tanya via WhatsApp
                </a>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Kontak */}
      <section className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-1 text-base font-semibold text-gray-900">Masih butuh bantuan?</h2>
        <p className="mb-4 text-sm text-gray-500">
          Hubungi tim dukungan kami — sertakan email akun &amp; deskripsi masalah.
        </p>
        <div className="space-y-2.5">
          <a
            href={waLink('Halo Populi, saya butuh bantuan terkait aplikasi survei.')}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm transition-colors hover:bg-emerald-100"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <MessageCircle className="h-4 w-4" />
            </span>
            <span className="flex-1">
              <span className="block font-semibold text-emerald-800">WhatsApp</span>
              <span className="text-xs text-emerald-700">{SUPPORT.whatsappDisplay}</span>
            </span>
          </a>
          <a
            href={`mailto:${SUPPORT.email}`}
            className="flex items-center gap-3 rounded-xl border border-gray-200 px-4 py-3 text-sm transition-colors hover:bg-gray-50"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-50 text-primary-600">
              <Mail className="h-4 w-4" />
            </span>
            <span className="flex-1">
              <span className="block font-semibold text-gray-800">Email</span>
              <span className="text-xs text-gray-500">{SUPPORT.email}</span>
            </span>
          </a>
          <a
            href={SUPPORT.website}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-xl border border-gray-200 px-4 py-3 text-sm transition-colors hover:bg-gray-50"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary-50 text-primary-600">
              <Globe className="h-4 w-4" />
            </span>
            <span className="flex-1">
              <span className="block font-semibold text-gray-800">Situs Web</span>
              <span className="text-xs text-gray-500">
                {SUPPORT.website.replace(/^https?:\/\//, '')}
              </span>
            </span>
          </a>
        </div>
      </section>
    </div>
  );
}
