import { useMemo, useState } from 'react';
import {
  ChevronDown,
  Mail,
  Globe,
  MessageCircle,
  Search,
  SendHorizontal,
  X,
  type LucideIcon,
} from 'lucide-react';
import { api } from '@/services/api';
import { Button, buttonCls, useTapFeedback } from '@/components/common/Button';
import { fieldCls } from '@/components/common/fieldStyles';
import { IconButton } from '@/components/common/IconButton';
import { Skeleton } from '@/components/common/Skeleton';

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
  keywords: string;
}

const FAQS: Faq[] = [
  {
    q: 'Bagaimana cara mendapatkan poin?',
    a: 'Anda mendapat poin setiap kali menyelesaikan survei. Jumlah poin tiap survei ditentukan oleh tim survei dan tampil di daftar survei.',
    keywords: 'poin point dapat hadiah reward survei isi',
  },
  {
    q: 'Bagaimana cara menukar poin?',
    a: 'Buka tab Reward → pilih Pulsa atau nama e-wallet Anda → tekan Tukar → masukkan nomor tujuan → konfirmasi. Poin akan terpotong sesuai nilai reward.',
    keywords: 'tukar redeem pulsa ewallet e-wallet gopay ovo dana poin',
  },
  {
    q: 'Poin saya belum bertambah setelah mengisi survei.',
    a: 'Poin biasanya masuk segera setelah survei terkirim. Jika belum, buka tab Reward untuk memperbarui saldo. Pastikan koneksi internet aktif saat mengirim jawaban.',
    keywords: 'poin belum bertambah masuk gagal saldo survei selesai',
  },
  {
    q: 'Pulsa/e-wallet belum saya terima.',
    a: 'Penukaran diproses otomatis. Cek status di Reward → Riwayat penukaran. Untuk pulsa, gunakan nomor PRABAYAR (nomor pascabayar tidak bisa diisi). Bila gagal, poin otomatis dikembalikan.',
    keywords: 'pulsa ewallet e-wallet belum terima gagal gopay ovo dana prabayar refund',
  },
  {
    q: 'Bagaimana mengubah data diri saya?',
    a: 'Buka tab Profil → Ubah data diri. Sebagian data (tanggal lahir, jenis kelamin, wilayah KTP) dikunci untuk menjaga kualitas data; domisili terkini akan ditanyakan langsung di survei bila diperlukan.',
    keywords: 'data diri profil ubah edit nama telepon email wilayah',
  },
  {
    q: 'Apakah data saya aman?',
    a: 'Ya. Identitas dan lokasi Anda hanya digunakan untuk keperluan riset dan tidak diperjualbelikan. Lihat Kebijakan Privasi di menu Profil.',
    keywords: 'aman privasi keamanan data lokasi gps identitas',
  },
];

const SUGGESTIONS = ['Cara dapat poin', 'Tukar poin', 'Pulsa belum masuk', 'Ubah data diri'];

function FaqItem({ faq, defaultOpen }: { faq: Faq; defaultOpen?: boolean }) {
  const tap = useTapFeedback();
  const [open, setOpen] = useState(Boolean(defaultOpen));
  return (
    <div>
      <button
        type="button"
        aria-expanded={open}
        onClick={(e) => {
          tap(e);
          setOpen((v) => !v);
        }}
        className="flex min-h-11 w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-50 focus-visible:-outline-offset-2"
      >
        <span className="flex-1 text-sm font-medium text-gray-800">{faq.q}</span>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-gray-500 transition-transform ${open ? 'rotate-180' : ''}`}
          strokeWidth={1.75}
          aria-hidden="true"
        />
      </button>
      {open && <p className="px-4 pb-4 text-sm leading-relaxed text-gray-600">{faq.a}</p>}
    </div>
  );
}

/** Satu baris tautan kontak: ikon polos, nama saluran, dan alamatnya. */
function ContactRow({
  href,
  external,
  icon: Icon,
  label,
  value,
}: {
  href: string;
  external?: boolean;
  icon: LucideIcon;
  label: string;
  value: string;
}) {
  const tap = useTapFeedback();
  return (
    <a
      href={href}
      onClick={tap}
      {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
      className="flex min-h-11 items-center gap-3 px-4 py-3 text-sm transition-colors hover:bg-gray-50 focus-visible:-outline-offset-2"
    >
      <Icon className="h-5 w-5 shrink-0 text-gray-600" strokeWidth={1.75} aria-hidden="true" />
      <span className="min-w-0 flex-1">
        <span className="block font-medium text-gray-800">{label}</span>
        <span className="block break-words text-xs tabular-nums text-gray-600">{value}</span>
      </span>
    </a>
  );
}

export function HelpPage() {
  const tap = useTapFeedback();
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
      <div className="space-y-4">
        <h1 className="text-2xl font-bold text-gray-900">Bantuan</h1>

        {/* Kolom tanya */}
        <div className="space-y-1.5">
          <label htmlFor="help-question" className="block text-sm font-medium text-gray-700">
            Tulis pertanyaan Anda
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-gray-500">
              <Search className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
            </span>
            <input
              id="help-question"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="mis. cara tukar poin"
              className={`${fieldCls} pl-10 pr-12`}
            />
            {query && (
              <span className="absolute inset-y-0 right-0.5 flex items-center">
                <IconButton aria-label="Hapus pertanyaan" onClick={() => onQueryChange('')}>
                  <X className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                </IconButton>
              </span>
            )}
          </div>
        </div>

        {/* Chip saran */}
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <Button
              key={s}
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => onQueryChange(s)}
            >
              {s}
            </Button>
          ))}
        </div>
      </div>

      {/* Hasil / FAQ */}
      <section className="space-y-2.5">
        <h2 className="text-sm font-semibold text-gray-700">
          {searching ? `Hasil untuk “${query.trim()}”` : 'Pertanyaan yang sering diajukan'}
        </h2>

        {noResult ? (
          <p className="text-sm text-gray-600">Tidak ada pertanyaan yang cocok.</p>
        ) : (
          <div className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white">
            {results.map((f) => (
              <FaqItem key={f.q} faq={f} defaultOpen={searching && results.length === 1} />
            ))}
          </div>
        )}

        {/* Asisten AI (fallback) — hanya saat sedang mencari */}
        {searching && (
          <div className="space-y-3 pt-1">
            {!aiLoading && !aiAnswer && !aiUnavailable && (
              <Button type="button" variant="secondary" className="w-full" onClick={askAi}>
                Tanyakan ke asisten
              </Button>
            )}

            {aiLoading && (
              <div className="space-y-2.5 rounded-xl border border-gray-200 bg-white p-4">
                <p role="status" className="text-xs text-gray-600">
                  Asisten sedang menulis jawaban…
                </p>
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            )}

            {aiAnswer && (
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="text-xs font-medium text-gray-600">Jawaban otomatis dari asisten</p>
                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-gray-700">
                  {aiAnswer}
                </p>
                <div className="mt-3 flex items-center justify-between gap-3 border-t border-gray-100 pt-3">
                  <span className="text-xs text-gray-500">
                    Jawaban AI bisa keliru — untuk hal terkait akun/poin, hubungi tim kami.
                  </span>
                  <a
                    href={waLink(`Halo Populi, saya butuh bantuan: ${query.trim()}`)}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={tap}
                    className={buttonCls('secondary', 'sm', 'shrink-0')}
                  >
                    <MessageCircle className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                    WhatsApp
                  </a>
                </div>
              </div>
            )}

            {aiUnavailable && (
              <div className="rounded-xl border border-gray-200 bg-white p-4">
                <p className="text-sm text-gray-600">
                  Asisten AI sedang tidak tersedia. Tim kami siap membantu via WhatsApp.
                </p>
                <a
                  href={waLink(`Halo Populi, saya butuh bantuan: ${query.trim()}`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={tap}
                  className={buttonCls('secondary', 'md', 'mt-3')}
                >
                  <SendHorizontal className="h-4 w-4" strokeWidth={1.75} aria-hidden="true" />
                  Tanya via WhatsApp
                </a>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Kontak */}
      <section className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <div className="p-4 pb-3">
          <h2 className="text-base font-semibold text-gray-900">Hubungi kami</h2>
          <p className="mt-0.5 text-sm text-gray-600">
            Sertakan email akun &amp; deskripsi masalah.
          </p>
        </div>
        <div className="divide-y divide-gray-100 border-t border-gray-100">
          <ContactRow
            href={waLink('Halo Populi, saya butuh bantuan terkait aplikasi survei.')}
            external
            icon={MessageCircle}
            label="WhatsApp"
            value={SUPPORT.whatsappDisplay}
          />
          <ContactRow
            href={`mailto:${SUPPORT.email}`}
            icon={Mail}
            label="Email"
            value={SUPPORT.email}
          />
          <ContactRow
            href={SUPPORT.website}
            external
            icon={Globe}
            label="Situs web"
            value={SUPPORT.website.replace(/^https?:\/\//, '')}
          />
        </div>
      </section>
    </div>
  );
}
