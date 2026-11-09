import { Injectable } from '@nestjs/common';
import {
  EmailTemplate,
  SurveyInvitationContext,
  ReminderContext,
  SubmissionConfirmationContext,
  PointsThresholdContext,
  RedemptionConfirmationContext,
  RedemptionFailedContext,
  OtpContext,
  PasswordResetContext,
  AnnouncementContext,
} from '../interfaces';

/* ---------------------------------------------------------------------------
 * Model konten email
 *
 * Setiap template hanya menyusun KONTEN (subjek, preheader, judul, dan daftar
 * blok). Versi HTML dan teks polos dirender dari blok yang sama, jadi isinya
 * selalu setara. Semua string di dalam blok adalah teks MENTAH: renderer HTML
 * yang meng-escape, sehingga template tidak mungkin lupa melakukannya.
 * ------------------------------------------------------------------------- */

/** Potongan kalimat: teks biasa atau teks tebal. */
type Inline = string | { strong: string };

interface Fact {
  label: string;
  value: string;
}

/** Angka utama yang dibuat besar (poin, sisa hari). */
interface Highlight {
  label: string;
  value: string;
  unit?: string;
  caption?: string;
}

type NoticeTone = 'neutral' | 'warning' | 'danger';

type Block =
  | { kind: 'para'; parts: Inline[]; small?: boolean }
  /** Teks bebas (isi pengumuman): baris kosong = paragraf baru, enter = <br>. */
  | { kind: 'prose'; text: string }
  /** Angka besar dalam bingkai garis navy, opsional diikuti baris rincian. */
  | { kind: 'figure'; figure: Highlight; rows?: Fact[] }
  /** Kartu ringkas survei: judul, deskripsi singkat, angka utama, dan baris fakta. */
  | {
      kind: 'survey';
      title: string;
      description?: string;
      highlight?: Highlight;
      facts: Fact[];
    }
  /** Tabel rincian (label kiri, nilai kanan) bergaris navy di atas. */
  | { kind: 'facts'; rows: Fact[] }
  | { kind: 'code'; code: string; caption: Inline[] }
  | { kind: 'button'; label: string; url: string | null }
  | { kind: 'notice'; tone: NoticeTone; title?: string; parts: Inline[] }
  /** Tautan cadangan di bawah tombol (hanya HTML; versi teks sudah memuat URL). */
  | { kind: 'fallbackLink'; url: string | null };

interface EmailContent {
  subject: string;
  /** Teks pratinjau di kotak masuk (disembunyikan di badan email). */
  preheader: string;
  /** Label kecil di atas judul, mis. "Undangan survei". */
  eyebrow: string;
  heading: string;
  blocks: Block[];
}

/* ---------------------------------------------------------------------------
 * Token visual "Tinta Populi" (nilai terang dari frontend globals.css). Email
 * tidak mendukung CSS variable, jadi nilainya disalin di sini.
 * ------------------------------------------------------------------------- */
const COLOR = {
  page: '#f5f6f6', // surface
  panel: '#ffffff',
  inset: '#f7f8f8', // gray-50
  line: '#dfe2e3', // gray-200
  lineSoft: '#eef0f0', // gray-100
  ink: '#181d20', // gray-900
  text: '#383f43', // gray-700
  textSoft: '#4a5256', // gray-600
  muted: '#586064', // gray-500
  navy: '#0f2342', // primary-900: judul, angka, garis tabel
  action: '#234e8c', // primary-600: tombol dan tautan
  onAction: '#ffffff',
} as const;

const TONES: Record<NoticeTone, { bg: string; border: string; title: string }> = {
  neutral: { bg: COLOR.inset, border: COLOR.line, title: COLOR.ink },
  warning: { bg: '#faf4e4', border: '#e6d6a8', title: '#7a5300' },
  danger: { bg: '#fbf0ee', border: '#edcdc8', title: '#a12c24' },
};

// Tumpukan font sistem saja (tanpa web font). Outlook desktop dipaksa ke Arial /
// Georgia lewat <style> bersyarat mso di layout().
const SANS = "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
const SERIF = "Georgia,'Times New Roman',Times,serif";
const MONO = "'SFMono-Regular',Menlo,Consolas,'Liberation Mono','Courier New',monospace";

const MAX_DESCRIPTION = 280;

const MONTHS = [
  'Januari',
  'Februari',
  'Maret',
  'April',
  'Mei',
  'Juni',
  'Juli',
  'Agustus',
  'September',
  'Oktober',
  'November',
  'Desember',
];

/** WIB = UTC+7 sepanjang tahun (tanpa DST). */
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Escape HTML untuk teks dan nilai atribut (dalam tanda kutip ganda). */
function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Nilai string dari context; null/undefined menjadi string kosong. */
function str(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim();
}

/** Satu baris (untuk subjek dan preheader): rapatkan spasi dan baris baru. */
function oneLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

/** Angka format id-ID (mis. 12000 → "12.000"); nilai tidak valid → "0". */
function num(value: unknown): string {
  const n = Number(value);
  return Number.isFinite(n) ? n.toLocaleString('id-ID') : '0';
}

/** Potong teks panjang di batas kata agar kartu survei tetap ringkas. */
function truncate(value: string, max: number): string {
  const flat = oneLine(value);
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s.,;:]+$/, '')}…`;
}

function greeting(name: unknown): Inline {
  const n = str(name);
  return n ? `Halo ${n},` : 'Halo,';
}

/**
 * rewardInfo berbentuk "500 poin" ditampilkan sebagai angka besar; teks hadiah
 * lain (mis. "Pulsa Rp 10.000 untuk 100 pengisi pertama") tetap baris biasa.
 */
function pointsReward(reward: string): string | null {
  // "500 poin", "5000 poin", atau yang sudah berformat "5.000 poin".
  const match = /^(\d{1,3}(?:\.\d{3})+|\d+)\s*poin$/i.exec(reward);
  if (!match) return null;
  return match[1].includes('.') ? match[1] : num(match[1]);
}

/** Instan waktu → "9 November 2026, 14.32 WIB". */
function formatWib(date: Date): string {
  const w = new Date(date.getTime() + WIB_OFFSET_MS);
  const hh = String(w.getUTCHours()).padStart(2, '0');
  const mm = String(w.getUTCMinutes()).padStart(2, '0');
  return `${w.getUTCDate()} ${MONTHS[w.getUTCMonth()]} ${w.getUTCFullYear()}, ${hh}.${mm} WIB`;
}

/**
 * Waktu kiriman jawaban. Pemanggil mengirim toLocaleString('id-ID') waktu lokal
 * proses, mis. "9/11/2026, 14.32.10": urutan tanggal/bulan ambigu, ada detik,
 * tanpa zona. Teks itu dibaca balik sebagai waktu lokal proses (sama dengan
 * pembuatnya) lalu ditulis ulang sebagai "9 November 2026, 14.32 WIB". ISO juga
 * diterima. Format lain ditampilkan apa adanya.
 */
function formatSubmittedAt(raw: unknown): string {
  const value = str(raw);
  if (!value) return '';
  const local = /^(\d{1,2})\/(\d{1,2})\/(\d{4}),?\s+(\d{1,2})[.:](\d{2})(?:[.:](\d{2}))?$/.exec(
    value,
  );
  if (local) {
    const [d, m, y, h, mi, s] = local.slice(1).map((v) => Number(v ?? 0));
    const date = new Date(y, m - 1, d, h, mi, s);
    // Tolak tanggal yang "digulung" Date (mis. 31/2 → 3 Maret) dan jam tak valid.
    const valid =
      m >= 1 && m <= 12 && h < 24 && mi < 60 && date.getDate() === d && date.getMonth() === m - 1;
    return valid ? formatWib(date) : value;
  }
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return formatWib(date);
  }
  return value;
}

/* Alasan gagal penukaran berasal dari provider (IAK) atau catatan admin, apa
 * adanya. Pesan teknis (nama provider, kode rc, HTTP, kredensial) dan pesan
 * provider berbahasa Inggris tidak ditampilkan mentah ke responden. */
const TECHNICAL_REASON =
  /\b(?:iak|rc\s*=|http\s*\d{3}|provider|kredensial|credentials?|signature|whitelist|deposit|timeout|exception|error)\b/i;
const ENGLISH_REASON =
  /\b(?:the|is|not|invalid|incorrect|failed|blocked|found|number|destination|customer|balance|product)\b/i;
const NUMBER_REASON = /nomor|number|msisdn|destination|tujuan|pelanggan|customer/i;

/** Alasan gagal yang layak dibaca responden + apakah terkait nomor tujuan. */
function failureReason(raw: unknown): { text: string; aboutNumber: boolean } | null {
  const reason = oneLine(str(raw));
  if (!reason) return null;
  const aboutNumber = NUMBER_REASON.test(reason);
  if (!TECHNICAL_REASON.test(reason) && !ENGLISH_REASON.test(reason)) {
    return { text: truncate(reason, 200), aboutNumber };
  }
  return {
    text: aboutNumber
      ? 'Nomor tujuan tidak valid atau tidak dapat menerima reward ini.'
      : 'Penyedia layanan belum dapat memproses penukaran ini.',
    aboutNumber,
  };
}

@Injectable()
export class EmailTemplateService {
  renderTemplate(
    template: EmailTemplate,
    context: Record<string, any>,
  ): { subject: string; html: string; text: string } {
    const content = this.renderContent(template, context);
    // Semua email memakai bingkai brand yang sama (header logo + footer).
    return {
      subject: oneLine(content.subject),
      html: this.toHtml(content),
      text: this.toText(content),
    };
  }

  private renderContent(template: EmailTemplate, context: Record<string, any>): EmailContent {
    switch (template) {
      case EmailTemplate.SURVEY_INVITATION:
        return this.renderSurveyInvitation(context as SurveyInvitationContext);
      case EmailTemplate.REMINDER_H3:
        return this.renderReminder(context as ReminderContext, 3);
      case EmailTemplate.REMINDER_H1:
        return this.renderReminder(context as ReminderContext, 1);
      case EmailTemplate.SUBMISSION_CONFIRMATION:
        return this.renderSubmissionConfirmation(context as SubmissionConfirmationContext);
      case EmailTemplate.POINTS_THRESHOLD:
        return this.renderPointsThreshold(context as PointsThresholdContext);
      case EmailTemplate.REDEMPTION_CONFIRMATION:
        return this.renderRedemptionConfirmation(context as RedemptionConfirmationContext);
      case EmailTemplate.REDEMPTION_FAILED:
        return this.renderRedemptionFailed(context as RedemptionFailedContext);
      case EmailTemplate.OTP_VERIFICATION:
        return this.renderOtp(context as OtpContext);
      case EmailTemplate.PASSWORD_RESET:
        return this.renderPasswordReset(context as PasswordResetContext);
      case EmailTemplate.ANNOUNCEMENT:
        return this.renderAnnouncement(context as AnnouncementContext);
      default:
        throw new Error(`Unknown email template: ${template}`);
    }
  }

  /** URL aplikasi untuk logo & tautan (dari env, default produksi). */
  private get appUrl(): string {
    return (process.env.APP_URL || 'https://survei.populicenter.com').replace(/\/+$/, '');
  }

  /**
   * Tautan aman untuk href: hanya http/https absolut, atau path relatif "/..."
   * yang diawali appUrl. Selain itu (javascript:, data:, "//host", kosong) → null,
   * dan tombolnya tidak dirender.
   */
  private safeUrl(raw: unknown): string | null {
    const value = str(raw);
    if (!value) return null;
    if (value.startsWith('/') && !value.startsWith('//')) return `${this.appUrl}${value}`;
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
    } catch {
      return null;
    }
  }

  /**
   * Seperti safeUrl, tetapi hanya untuk halaman aplikasi sendiri: origin harus
   * APP_URL atau APP_BASE_URL (basis tautan email di pemanggil) dan tanpa
   * userinfo. Dipakai untuk tautan yang disusun dari teks bebas admin
   * (pengumuman), agar "https://app@evil.test/..." atau "https://app.evil.test/..."
   * tidak tampil sebagai tombol bermerek.
   */
  private appOnlyUrl(raw: unknown): string | null {
    const safe = this.safeUrl(raw);
    if (!safe) return null;
    const origins = [this.appUrl, process.env.APP_BASE_URL]
      .map((base) => {
        try {
          return new URL(str(base)).origin;
        } catch {
          return null;
        }
      })
      .filter((origin): origin is string => !!origin);
    try {
      const url = new URL(safe);
      if (url.username || url.password) return null;
      return origins.includes(url.origin) ? safe : null;
    } catch {
      return null;
    }
  }

  /** Halaman di aplikasi (path tetap milik kita, bukan dari context). */
  private appLink(path: string): string {
    return `${this.appUrl}${path}`;
  }

  /**
   * Format tanggal batas waktu untuk email. Nilai kosong/invalid → "Tidak ada
   * batas waktu" (bukan label kosong yang terlihat rusak). Pakai getter UTC agar
   * hasil deterministik lintas zona waktu server (nilai tersimpan berbasis
   * tanggal). Contoh: "2026-06-01" / ISO → "1 Juni 2026".
   */
  private formatDeadline(raw?: string): string {
    if (!raw) return 'Tidak ada batas waktu';
    const d = new Date(raw);
    if (Number.isNaN(d.getTime())) return 'Tidak ada batas waktu';
    return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  }

  /** True bila formatDeadline menghasilkan tanggal sungguhan. */
  private hasDeadline(raw?: string): boolean {
    return !!raw && !Number.isNaN(new Date(raw).getTime());
  }

  /* -------------------------------------------------------------------------
   * Template
   * ----------------------------------------------------------------------- */

  private renderSurveyInvitation(context: SurveyInvitationContext): EmailContent {
    const title = str(context.surveyTitle);
    const reward = str(context.rewardInfo);
    const description = str(context.surveyDescription);
    const deadline = this.formatDeadline(context.deadline);
    const hasDeadline = this.hasDeadline(context.deadline);

    const rewardPoints = pointsReward(reward);
    const facts: Fact[] = [];
    if (reward && !rewardPoints) facts.push({ label: 'Hadiah', value: reward });
    facts.push({ label: 'Batas waktu', value: deadline });

    const preheaderParts = [
      reward ? `Hadiah ${rewardPoints ? `${rewardPoints} poin` : reward}.` : '',
      hasDeadline ? `Isi sebelum ${deadline}.` : 'Tidak ada batas waktu.',
      'Pendapat Anda ikut menentukan hasilnya.',
    ];

    return {
      subject: title ? `Survei baru menunggu Anda: ${title}` : 'Survei baru menunggu Anda',
      preheader: preheaderParts.filter(Boolean).join(' '),
      eyebrow: 'Undangan survei',
      heading: 'Survei baru menunggu Anda',
      blocks: [
        { kind: 'para', parts: [greeting(context.respondentName)] },
        {
          kind: 'para',
          parts: [
            'Pendapat Anda dibutuhkan untuk survei di bawah ini. Luangkan waktu sebentar untuk mengisinya.',
          ],
        },
        {
          kind: 'survey',
          title,
          description: description ? truncate(description, MAX_DESCRIPTION) : undefined,
          highlight: rewardPoints
            ? { label: 'Hadiah setelah selesai', value: rewardPoints, unit: 'poin' }
            : undefined,
          facts,
        },
        { kind: 'button', label: 'Isi survei sekarang', url: this.safeUrl(context.surveyUrl) },
      ],
    };
  }

  private renderReminder(context: ReminderContext, daysRemaining: number): EmailContent {
    const title = str(context.surveyTitle);
    const deadline = this.formatDeadline(context.deadline);
    const hasDeadline = this.hasDeadline(context.deadline);
    const lastDay = daysRemaining <= 1;

    return {
      subject: `Tinggal ${daysRemaining} hari untuk mengisi ${title ? `"${title}"` : 'survei'}`,
      preheader: hasDeadline
        ? `Survei ditutup ${deadline}. Jawaban Anda masih kami tunggu.`
        : 'Jawaban Anda masih kami tunggu.',
      eyebrow: 'Pengingat survei',
      heading: lastDay ? 'Kesempatan terakhir mengisi survei' : 'Jawaban Anda masih kami tunggu',
      blocks: [
        { kind: 'para', parts: [greeting(context.respondentName)] },
        {
          kind: 'para',
          parts: [
            'Survei di bawah ini akan ditutup dalam ',
            { strong: `${daysRemaining} hari` },
            '. Masih ada waktu untuk menyelesaikannya.',
          ],
        },
        {
          kind: 'survey',
          title,
          highlight: {
            label: 'Sisa waktu',
            value: String(daysRemaining),
            unit: 'hari lagi',
            caption: hasDeadline ? `Ditutup ${deadline}` : undefined,
          },
          facts: [],
        },
        { kind: 'button', label: 'Isi survei sekarang', url: this.safeUrl(context.surveyUrl) },
        { kind: 'para', small: true, parts: ['Sudah mengisi? Abaikan email ini.'] },
      ],
    };
  }

  private renderSubmissionConfirmation(context: SubmissionConfirmationContext): EmailContent {
    const title = str(context.surveyTitle);
    const submittedAt = formatSubmittedAt(context.submittedAt);
    const points = Number(context.pointsEarned);
    const hasPoints = Number.isFinite(points) && points > 0;

    const facts: Fact[] = submittedAt ? [{ label: 'Dikirim pada', value: submittedAt }] : [];

    // Email ini dikirim PARALEL dengan pengkreditan poin (handler terpisah untuk
    // event yang sama), dan pointsEarned adalah poin dasar survei: kredit akhir
    // bisa lebih besar karena pengali streak. Jadi jangan menyatakan poin "sudah
    // masuk" atau menyebut angka pasti di subjek.
    return {
      subject: title
        ? `Terima kasih! Jawaban Anda untuk "${title}" sudah diterima`
        : 'Terima kasih! Jawaban Anda sudah diterima',
      preheader: hasPoints
        ? `Jawaban Anda sudah kami terima. Survei ini memberi ${num(points)} poin untuk saldo Anda.`
        : 'Jawaban Anda sudah kami terima. Terima kasih atas partisipasinya.',
      eyebrow: 'Jawaban terkirim',
      heading: 'Terima kasih atas jawaban Anda',
      blocks: [
        { kind: 'para', parts: [greeting(context.respondentName)] },
        {
          kind: 'para',
          parts: ['Jawaban Anda untuk survei berikut sudah kami terima dengan baik.'],
        },
        {
          kind: 'survey',
          title,
          highlight: hasPoints
            ? {
                label: 'Poin survei ini',
                value: `+${num(points)}`,
                unit: 'poin',
                caption: 'Akan masuk ke saldo Anda dalam beberapa saat.',
              }
            : undefined,
          facts,
        },
        hasPoints
          ? { kind: 'button', label: 'Lihat poin saya', url: this.appLink('/rewards') }
          : { kind: 'button', label: 'Lihat survei lainnya', url: this.appLink('/surveys') },
      ],
    };
  }

  private renderPointsThreshold(context: PointsThresholdContext): EmailContent {
    const balance = num(context.currentBalance);
    const threshold = num(context.threshold);
    // `threshold` di sini adalah tonggak notifikasi (POINTS_THRESHOLD), BUKAN
    // minimum penukaran (MINIMUM_REDEMPTION_THRESHOLD jauh lebih kecil), jadi
    // jangan disebut "minimum". Tombol memakai /rewards: context.redeemUrl
    // menunjuk /rewards/redeem yang tidak ada di router frontend (NotFound).
    return {
      subject: `Saldo poin Anda sudah mencapai ${threshold} poin dan siap ditukar`,
      preheader: `Saldo Anda kini ${balance} poin. Tukarkan dengan pulsa atau saldo e-wallet.`,
      eyebrow: 'Saldo poin',
      heading: 'Poin Anda siap ditukar',
      blocks: [
        { kind: 'para', parts: [greeting(context.respondentName)] },
        {
          kind: 'para',
          parts: [
            'Kerja bagus! Saldo poin Anda sudah mencapai ',
            { strong: `${threshold} poin` },
            '. Tukarkan dengan pulsa atau saldo e-wallet langsung dari aplikasi.',
          ],
        },
        {
          kind: 'figure',
          figure: { label: 'Saldo saat ini', value: balance, unit: 'poin' },
        },
        { kind: 'button', label: 'Tukar poin sekarang', url: this.appLink('/rewards') },
      ],
    };
  }

  private renderRedemptionConfirmation(context: RedemptionConfirmationContext): EmailContent {
    const reward = str(context.rewardType);
    const sent = `${reward || 'Reward Anda'} sudah dikirim`;
    const destination = str(context.destinationNumber);
    const rows: Fact[] = reward ? [{ label: 'Reward', value: reward }] : [];
    if (destination) rows.push({ label: 'Nomor tujuan', value: destination });
    rows.push({ label: 'Poin dipakai', value: `${num(context.pointsSpent)} poin` });
    rows.push({ label: 'Sisa saldo', value: `${num(context.remainingBalance)} poin` });

    return {
      subject: `Penukaran berhasil: ${sent}`,
      preheader: `${sent}${destination ? ` ke ${destination}` : ''}. Sisa saldo ${num(context.remainingBalance)} poin.`,
      eyebrow: 'Penukaran berhasil',
      heading: sent,
      blocks: [
        { kind: 'para', parts: [greeting(context.respondentName)] },
        {
          kind: 'para',
          parts: [
            // Kolom nomor tujuan nullable: tanpa nomor, jangan merujuk "di bawah ini".
            destination
              ? 'Penukaran poin Anda berhasil. Reward sudah kami kirim ke nomor tujuan di bawah ini.'
              : 'Penukaran poin Anda berhasil dan reward sudah kami kirim.',
          ],
        },
        { kind: 'facts', rows },
        { kind: 'button', label: 'Lihat riwayat penukaran', url: this.appLink('/rewards') },
        {
          kind: 'para',
          small: true,
          parts: [
            'Reward belum diterima dalam 1×24 jam? Hubungi kami lewat menu Bantuan di aplikasi.',
          ],
        },
      ],
    };
  }

  private renderRedemptionFailed(context: RedemptionFailedContext): EmailContent {
    const reward = str(context.rewardType);
    const destination = str(context.destinationNumber);
    const reason = failureReason(context.reason);
    const refunded = num(context.pointsRefunded);
    const balance = num(context.remainingBalance);

    const rows: Fact[] = reward ? [{ label: 'Reward', value: reward }] : [];
    if (destination) rows.push({ label: 'Nomor tujuan', value: destination });

    const blocks: Block[] = [
      { kind: 'para', parts: [greeting(context.respondentName)] },
      {
        kind: 'para',
        parts: [
          'Mohon maaf, penukaran reward Anda tidak dapat diselesaikan. ',
          { strong: 'Poin Anda sudah dikembalikan sepenuhnya.' },
        ],
      },
      {
        kind: 'figure',
        figure: {
          label: 'Poin dikembalikan',
          value: `+${refunded}`,
          unit: 'poin',
          caption: `Saldo sekarang ${balance} poin`,
        },
        rows,
      },
    ];
    if (reason) {
      blocks.push({ kind: 'notice', tone: 'warning', title: 'Alasan', parts: [reason.text] });
    }
    blocks.push(
      {
        kind: 'para',
        parts: [
          // Saran memeriksa nomor hanya bila kegagalannya memang soal nomor tujuan
          // (bukan pembatalan admin atau gangguan di sisi penyedia layanan).
          reason?.aboutNumber
            ? 'Periksa kembali nomor tujuan Anda, lalu coba tukar lagi. Bila masalah berlanjut, hubungi kami lewat menu Bantuan di aplikasi.'
            : 'Anda bisa mencoba menukar lagi dari aplikasi. Bila masalah berlanjut, hubungi kami lewat menu Bantuan di aplikasi.',
        ],
      },
      { kind: 'button', label: 'Coba tukar lagi', url: this.appLink('/rewards') },
    );

    return {
      subject: `Penukaran ${reward || 'reward'} gagal, poin Anda sudah dikembalikan`,
      preheader: `${refunded} poin sudah kembali ke saldo Anda. Saldo sekarang ${balance} poin.`,
      eyebrow: 'Penukaran gagal',
      heading: 'Penukaran gagal, poin Anda aman',
      blocks,
    };
  }

  private renderOtp(context: OtpContext): EmailContent {
    const isReset = context.purpose === 'reset';
    const isRedeem = context.purpose === 'redeem';
    const minutes = num(context.expiresInMinutes);

    // Subjek & preheader sengaja TIDAK memuat kode (keamanan: pratinjau notifikasi
    // terlihat di layar kunci). Gaya subjek sama dengan email lain: huruf kapital
    // hanya di awal, tanpa nama brand (sudah ada di nama pengirim).
    const subject = isReset
      ? 'Kode untuk mengatur ulang kata sandi'
      : isRedeem
        ? 'Kode konfirmasi penukaran poin'
        : 'Kode verifikasi akun Anda';
    const eyebrow = isReset
      ? 'Atur ulang kata sandi'
      : isRedeem
        ? 'Konfirmasi penukaran'
        : 'Verifikasi akun';
    const heading = isReset
      ? 'Kode untuk kata sandi baru'
      : isRedeem
        ? 'Kode konfirmasi penukaran poin'
        : 'Satu langkah lagi untuk mengaktifkan akun';
    const intro = isReset
      ? 'Masukkan kode berikut di aplikasi untuk mengatur ulang kata sandi akun Anda.'
      : isRedeem
        ? 'Masukkan kode berikut di aplikasi untuk mengonfirmasi penukaran poin Anda.'
        : 'Masukkan kode berikut di aplikasi untuk memverifikasi email dan mengaktifkan akun Anda.';
    const notRequested = isRedeem
      ? 'Bila Anda tidak sedang menukar poin, abaikan email ini dan segera ganti kata sandi akun Anda.'
      : 'Bila Anda tidak meminta kode ini, abaikan saja email ini.';

    return {
      subject,
      preheader: `Kode berlaku ${minutes} menit. Jangan bagikan kode ini kepada siapa pun.`,
      eyebrow,
      heading,
      blocks: [
        { kind: 'para', parts: [greeting(context.recipientName)] },
        { kind: 'para', parts: [intro] },
        {
          kind: 'code',
          code: str(context.otpCode),
          caption: ['Kode berlaku ', { strong: `${minutes} menit` }, '.'],
        },
        {
          kind: 'notice',
          tone: 'neutral',
          title: 'Jaga kerahasiaan kode ini',
          parts: [
            'Jangan bagikan kepada siapa pun, termasuk yang mengaku dari Populi Center. ',
            notRequested,
          ],
        },
      ],
    };
  }

  private renderPasswordReset(context: PasswordResetContext): EmailContent {
    const hours = num(context.expiresInHours);
    const url = this.safeUrl(context.resetLink);
    return {
      subject: 'Atur ulang kata sandi Anda',
      preheader: `Tautan berlaku ${hours} jam. Abaikan bila Anda tidak memintanya.`,
      eyebrow: 'Keamanan akun',
      heading: 'Atur ulang kata sandi Anda',
      blocks: [
        { kind: 'para', parts: [greeting(context.recipientName)] },
        {
          kind: 'para',
          parts: [
            'Kami menerima permintaan untuk mengatur ulang kata sandi akun Anda. Tekan tombol di bawah untuk membuat kata sandi baru. Tautan berlaku ',
            { strong: `${hours} jam` },
            '.',
          ],
        },
        { kind: 'button', label: 'Buat kata sandi baru', url },
        { kind: 'fallbackLink', url },
        {
          kind: 'notice',
          tone: 'neutral',
          parts: ['Tidak meminta ini? Abaikan email ini. Kata sandi Anda tidak akan berubah.'],
        },
      ],
    };
  }

  private renderAnnouncement(context: AnnouncementContext): EmailContent {
    const title = str(context.title);
    const body = str(context.body);
    return {
      subject: title || 'Pengumuman dari Populi Center',
      preheader: truncate(body, 120),
      eyebrow: 'Pengumuman',
      heading: title || 'Pengumuman',
      blocks: [
        { kind: 'para', parts: [greeting(context.respondentName)] },
        { kind: 'prose', text: body },
        // actionUrl = APP_BASE_URL + teks bebas admin; hanya halaman aplikasi sendiri.
        { kind: 'button', label: 'Buka di aplikasi', url: this.appOnlyUrl(context.actionUrl) },
      ],
    };
  }

  /* -------------------------------------------------------------------------
   * Renderer HTML
   * ----------------------------------------------------------------------- */

  private inlineHtml(parts: Inline[]): string {
    return parts
      .map((p) => {
        if (typeof p === 'string') return esc(p);
        // Frasa pendek seperti "3 hari" / "15 menit" jangan terpotong di dua baris.
        const nowrap = p.strong.length <= 20 ? 'white-space:nowrap;' : '';
        return `<strong style="font-weight:600;color:${COLOR.ink};${nowrap}">${esc(p.strong)}</strong>`;
      })
      .join('');
  }

  /** Label kecil, angka besar navy (+satuan), dan keterangan opsional. */
  private highlightHtml(h: Highlight, size: 36 | 44): string {
    const unit = h.unit
      ? `<span style="font-size:${size === 44 ? 20 : 18}px;line-height:24px;font-weight:600;letter-spacing:0;">&nbsp;${esc(h.unit)}</span>`
      : '';
    const caption = h.caption
      ? `\n<p style="margin:6px 0 0;font-family:${SANS};font-size:14px;line-height:20px;color:${COLOR.muted};">${esc(h.caption)}</p>`
      : '';
    return `<p style="margin:0;font-family:${SANS};font-size:13px;line-height:18px;color:${COLOR.muted};">${esc(h.label)}</p>
<p class="figure-${size}" style="margin:4px 0 0;font-family:${SANS};font-size:${size}px;line-height:${size + 6}px;font-weight:700;color:${COLOR.navy};letter-spacing:-1px;">${esc(h.value)}${unit}</p>${caption}`;
  }

  /**
   * Baris fakta label/nilai. Garis dipasang di <td> (bukan <table>) karena
   * Outlook desktop tidak andal merender border pada table. Label (teks tetap
   * dari template, pendek) tidak dipatah; nilai yang membungkus di layar sempit,
   * dengan "WIB" tetap menempel pada jamnya.
   */
  private factsRowsHtml(rows: Fact[], lastRule: boolean, firstTopRule = ''): string {
    return rows
      .map((row, i) => {
        const top = i === 0 && firstTopRule ? `border-top:${firstTopRule};` : '';
        const bottom =
          i < rows.length - 1 || lastRule ? `border-bottom:1px solid ${COLOR.line};` : '';
        const cell = `padding:11px 0;${top}${bottom}font-family:${SANS};font-size:14px;line-height:20px;`;
        return `<tr>
<td valign="top" style="${cell}color:${COLOR.muted};padding-right:16px;white-space:nowrap;">${esc(row.label)}</td>
<td valign="top" align="right" style="${cell}color:${COLOR.ink};font-weight:600;text-align:right;">${esc(row.value).replace(/ WIB$/, '&nbsp;WIB')}</td>
</tr>`;
      })
      .join('\n');
  }

  private blockHtml(block: Block): string {
    switch (block.kind) {
      case 'para':
        return block.small
          ? `<p style="margin:0;font-family:${SANS};font-size:14px;line-height:21px;color:${COLOR.muted};">${this.inlineHtml(block.parts)}</p>`
          : `<p style="margin:0;font-family:${SANS};font-size:16px;line-height:25px;color:${COLOR.text};">${this.inlineHtml(block.parts)}</p>`;

      case 'prose':
        return block.text
          .split(/\n\s*\n/)
          .map((p) => p.trim())
          .filter(Boolean)
          .map(
            (p, i) =>
              `<p style="margin:${i === 0 ? '0' : '16px 0 0'};font-family:${SANS};font-size:16px;line-height:25px;color:${COLOR.text};">${esc(p).replace(/\r?\n/g, '<br>')}</p>`,
          )
          .join('\n');

      case 'figure':
        return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
<tr><td style="padding:16px 0 18px;border-top:2px solid ${COLOR.navy};border-bottom:1px solid ${COLOR.line};">
${this.highlightHtml(block.figure, 44)}
</td></tr>${
          block.rows?.length
            ? `\n<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${this.factsRowsHtml(block.rows, true)}
</table></td></tr>`
            : ''
        }
</table>`;

      case 'survey': {
        // Bagian kartu dipisah garis tipis: judul (+deskripsi), angka utama, fakta.
        const sections: string[] = [];
        if (block.highlight) {
          sections.push(
            `<tr><td style="padding:14px 0 16px;border-top:1px solid ${COLOR.line};">
${this.highlightHtml(block.highlight, 36)}
</td></tr>`,
          );
        }
        if (block.facts.length) {
          sections.push(
            `<tr><td><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${this.factsRowsHtml(block.facts, false, `1px solid ${COLOR.line}`)}
</table></td></tr>`,
          );
        }
        return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLOR.inset}" style="background:${COLOR.inset};border:1px solid ${COLOR.line};border-radius:8px;border-collapse:separate;">
<tr><td style="padding:18px 20px ${sections.length ? '0' : '18px'};">
<p style="margin:0;font-family:${SANS};font-size:17px;line-height:24px;font-weight:600;color:${COLOR.ink};">${esc(block.title)}</p>${
          block.description
            ? `\n<p style="margin:6px 0 0;font-family:${SANS};font-size:14px;line-height:21px;color:${COLOR.textSoft};">${esc(block.description)}</p>`
            : ''
        }
</td></tr>${
          sections.length
            ? `\n<tr><td style="padding:14px 20px 4px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${sections.join('\n')}
</table></td></tr>`
            : ''
        }
</table>`;
      }

      case 'facts':
        return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${this.factsRowsHtml(block.rows, true, `2px solid ${COLOR.navy}`)}
</table>`;

      case 'code':
        // Kode tetap utuh (tanpa spasi) agar mudah disalin; jarak antarangka lewat
        // letter-spacing. Padding kiri ekstra mengimbangi spasi setelah angka terakhir.
        return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLOR.inset}" style="background:${COLOR.inset};border:1px solid ${COLOR.line};border-radius:8px;border-collapse:separate;">
<tr><td align="center" style="padding:22px 12px 6px 22px;">
<p class="otp" style="margin:0;font-family:${MONO};font-size:38px;line-height:44px;font-weight:700;letter-spacing:10px;color:${COLOR.navy};">${esc(block.code)}</p>
</td></tr>
<tr><td align="center" style="padding:0 12px 18px;font-family:${SANS};font-size:14px;line-height:20px;color:${COLOR.muted};">${this.inlineHtml(block.caption)}</td></tr>
</table>`;

      case 'button':
        if (!block.url) return '';
        // Bulletproof button: warna di <td> (Outlook) dan padding di <a> (klien
        // lain, sehingga seluruh tombol bisa diklik).
        return `<table role="presentation" class="btn" cellpadding="0" cellspacing="0" border="0">
<tr><td align="center" bgcolor="${COLOR.action}" style="border-radius:6px;background:${COLOR.action};mso-padding-alt:14px 28px;">
<a href="${esc(block.url)}" target="_blank" rel="noopener" style="display:inline-block;padding:14px 28px;font-family:${SANS};font-size:16px;line-height:20px;font-weight:600;color:${COLOR.onAction};text-decoration:none;border-radius:6px;mso-padding-alt:0;">${esc(block.label)}</a>
</td></tr>
</table>`;

      case 'notice': {
        const tone = TONES[block.tone];
        return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${tone.bg}" style="background:${tone.bg};border:1px solid ${tone.border};border-radius:6px;border-collapse:separate;">
<tr><td style="padding:14px 16px;font-family:${SANS};font-size:14px;line-height:21px;color:${COLOR.text};">${
          block.title
            ? `<p style="margin:0 0 2px;font-weight:600;color:${tone.title};">${esc(block.title)}</p>`
            : ''
        }<p style="margin:0;">${this.inlineHtml(block.parts)}</p></td></tr>
</table>`;
      }

      case 'fallbackLink':
        if (!block.url) return '';
        return `<p style="margin:0;font-family:${SANS};font-size:13px;line-height:20px;color:${COLOR.muted};">Tombol tidak bisa ditekan? Salin tautan ini ke peramban:<br><a href="${esc(block.url)}" target="_blank" rel="noopener" style="color:${COLOR.action};text-decoration:underline;word-break:break-all;">${esc(block.url)}</a></p>`;
    }
  }

  private toHtml(content: EmailContent): string {
    const blocks = content.blocks
      .map((b) => ({ b, html: this.blockHtml(b) }))
      .filter((x) => x.html);
    const rows = blocks
      .map(({ b, html }, i) => {
        const last = i === blocks.length - 1;
        // Paragraf berurutan cukup rapat; blok visual diberi ruang lebih lega.
        const next = blocks[i + 1]?.b;
        const textFlow = b.kind === 'para' && (next?.kind === 'para' || next?.kind === 'prose');
        const gap = last ? 0 : textFlow ? 12 : 24;
        return `<tr><td style="padding:0 0 ${gap}px;">${html}</td></tr>`;
      })
      .join('\n');

    const inner = `<p style="margin:0 0 10px;font-family:${SANS};font-size:13px;line-height:18px;font-weight:600;color:${COLOR.muted};">${esc(content.eyebrow)}</p>
<h1 class="hero serif" style="margin:0 0 24px;font-family:${SERIF};font-size:30px;line-height:36px;font-weight:normal;color:${COLOR.navy};">${esc(content.heading)}</h1>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
${rows}
</table>`;

    return this.layout(content.subject, content.preheader, inner);
  }

  /**
   * Bingkai brand untuk SEMUA email: kartu putih dengan header logo, isi, lalu
   * footer di luar kartu. Layout berbasis table + inline style agar konsisten di
   * Gmail, Outlook, dan Apple Mail; lebar maks 600px, menyempit di layar HP.
   */
  private layout(title: string, preheader: string, inner: string): string {
    // Zona waktu proses (TZ=Asia/Jakarta), bukan UTC: pada 1 Jan 00:00–07:00 WIB
    // UTC masih 31 Des, sehingga footer email akan menulis tahun lama sementara
    // footer web (getFullYear lokal) sudah tahun baru.
    const year = new Date().getFullYear();
    // Versi 192px (±14 KB), bukan berkas sumber 5700px: dekode berat di aplikasi
    // email HP. Ditampilkan 36px, jadi tetap tajam di layar 3x.
    const logo = `${this.appUrl}/logo-populi-center-192.png`;
    const privacy = this.appLink('/kebijakan-privasi');
    // Pengisi setelah preheader agar pratinjau kotak masuk tidak menarik teks isi.
    const filler = '&#847;&zwnj;&nbsp;'.repeat(60);

    return `<!DOCTYPE html>
<html lang="id" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="x-apple-disable-message-reformatting">
<meta name="format-detection" content="telephone=no, date=no, address=no, email=no">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(oneLine(title))}</title>
<!--[if mso]>
<noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
<style>table,td,p,a,span,strong,h1{font-family:Arial,Helvetica,sans-serif !important;}.serif{font-family:Georgia,serif !important;}.otp{font-family:'Courier New',monospace !important;}</style>
<![endif]-->
<style>
:root{color-scheme:light;supported-color-schemes:light;}
body{margin:0;padding:0;width:100%;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;}
table{border-collapse:collapse;mso-table-lspace:0pt;mso-table-rspace:0pt;}
img{border:0;outline:none;text-decoration:none;-ms-interpolation-mode:bicubic;}
a[x-apple-data-detectors]{color:inherit !important;text-decoration:none !important;}
@media only screen and (max-width:480px){
.gutter{padding:12px 8px 24px !important;}
.px{padding-left:20px !important;padding-right:20px !important;}
.hero{font-size:26px !important;line-height:32px !important;}
.figure-44{font-size:38px !important;line-height:44px !important;}
.figure-36{font-size:32px !important;line-height:38px !important;}
.otp{font-size:32px !important;letter-spacing:8px !important;}
.btn{width:100% !important;}
.btn a{display:block !important;}
}
</style>
</head>
<body style="margin:0;padding:0;background:${COLOR.page};" bgcolor="${COLOR.page}">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;color:${COLOR.page};">${esc(oneLine(preheader))}${filler}</div>
<div role="article" aria-roledescription="email" aria-label="${esc(oneLine(title))}" lang="id">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLOR.page}" style="background:${COLOR.page};">
<tr><td align="center" class="gutter" style="padding:32px 16px 40px;">
<!--[if mso]><table role="presentation" width="600" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;margin:0 auto;">
<tr><td>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLOR.panel}" style="background:${COLOR.panel};border:1px solid ${COLOR.line};border-radius:8px;border-collapse:separate;">
<tr><td class="px" bgcolor="${COLOR.navy}" style="background:${COLOR.navy};padding:20px 36px;border-radius:7px 7px 0 0;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
<td valign="middle" style="padding-right:10px;"><img src="${esc(logo)}" width="32" height="32" alt="" style="display:block;width:32px;height:32px;border:0;"></td>
<td valign="middle" style="font-family:${SANS};font-size:17px;line-height:22px;font-weight:600;color:${COLOR.onAction};">Populi Center</td>
</tr></table>
</td></tr>
<tr><td class="px" style="padding:32px 36px 36px;">
${inner}
</td></tr>
</table>
</td></tr>
<tr><td class="px" style="padding:24px 36px 0;font-family:${SANS};font-size:12px;line-height:19px;color:${COLOR.muted};">
<p style="margin:0;">Anda menerima email ini karena terdaftar di Riset Populi Center. Email ini dikirim otomatis, mohon tidak membalasnya.</p>
<p style="margin:8px 0 0;"><a href="${esc(privacy)}" target="_blank" rel="noopener" style="color:${COLOR.textSoft};text-decoration:underline;">Kebijakan Privasi</a>&nbsp;&nbsp;·&nbsp;&nbsp;© ${year} Populi Center</p>
</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</div>
</body>
</html>`;
  }

  /* -------------------------------------------------------------------------
   * Renderer teks polos (isi setara dengan HTML)
   * ----------------------------------------------------------------------- */

  private inlineText(parts: Inline[]): string {
    return parts.map((p) => (typeof p === 'string' ? p : p.strong)).join('');
  }

  private blockText(block: Block): string {
    const factLines = (rows: Fact[]) => rows.map((r) => `${r.label}: ${r.value}`);
    const highlightLines = (h: Highlight) =>
      [`${h.label}: ${h.value}${h.unit ? ` ${h.unit}` : ''}`, h.caption ?? ''].filter(Boolean);
    switch (block.kind) {
      case 'para':
        return this.inlineText(block.parts);
      case 'prose':
        return block.text
          .split(/\n\s*\n/)
          .map((p) => p.trim())
          .filter(Boolean)
          .join('\n\n');
      case 'figure':
        return [...highlightLines(block.figure), ...factLines(block.rows ?? [])].join('\n');
      case 'survey':
        return [
          block.title,
          block.description ?? '',
          ...(block.highlight ? highlightLines(block.highlight) : []),
          ...factLines(block.facts),
        ]
          .filter(Boolean)
          .join('\n');
      case 'facts':
        return factLines(block.rows).join('\n');
      case 'code':
        return `Kode: ${block.code}\n${this.inlineText(block.caption)}`;
      case 'button':
        return block.url ? `${block.label}:\n${block.url}` : '';
      case 'notice':
        return block.title
          ? `${block.title}: ${this.inlineText(block.parts)}`
          : this.inlineText(block.parts);
      case 'fallbackLink':
        return ''; // URL sudah tercantum pada blok tombol versi teks.
    }
  }

  private toText(content: EmailContent): string {
    const body = content.blocks
      .map((b) => this.blockText(b))
      .filter(Boolean)
      .join('\n\n');
    return [
      content.heading,
      body,
      [
        '--',
        'Populi Center',
        'Anda menerima email ini karena terdaftar di Riset Populi Center. Email ini dikirim otomatis, mohon tidak membalasnya.',
        `Kebijakan Privasi: ${this.appLink('/kebijakan-privasi')}`,
      ].join('\n'),
    ].join('\n\n');
  }
}
