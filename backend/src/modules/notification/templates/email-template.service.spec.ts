import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EmailTemplateService } from './email-template.service';
import { EmailTemplate } from '../interfaces';

const APP = 'https://app.test';

/** Context minimal yang valid untuk tiap template (dipakai tes lintas-template). */
const MINIMAL: Record<EmailTemplate, Record<string, unknown>> = {
  [EmailTemplate.SURVEY_INVITATION]: {
    respondentName: 'Saepudin',
    surveyTitle: 'Survei Nasional',
    deadline: '2026-06-01',
    surveyUrl: `${APP}/surveys/1/fill`,
  },
  [EmailTemplate.REMINDER_H3]: {
    respondentName: 'Saepudin',
    surveyTitle: 'Survei Nasional',
    daysRemaining: 3,
    deadline: '2026-06-01',
    surveyUrl: `${APP}/surveys/1/fill`,
  },
  [EmailTemplate.REMINDER_H1]: {
    respondentName: 'Saepudin',
    surveyTitle: 'Survei Nasional',
    daysRemaining: 1,
    deadline: '2026-06-01',
    surveyUrl: `${APP}/surveys/1/fill`,
  },
  [EmailTemplate.SUBMISSION_CONFIRMATION]: {
    respondentName: 'Saepudin',
    surveyTitle: 'Survei Nasional',
    submittedAt: '07/05/2026 10:00',
    pointsEarned: 500,
  },
  [EmailTemplate.POINTS_THRESHOLD]: {
    respondentName: 'Saepudin',
    currentBalance: 12000,
    threshold: 10000,
    redeemUrl: `${APP}/rewards`,
  },
  [EmailTemplate.REDEMPTION_CONFIRMATION]: {
    respondentName: 'Saepudin',
    rewardType: 'Pulsa Rp 25.000',
    pointsSpent: 2500,
    destinationNumber: '081234567890',
    remainingBalance: 7750,
  },
  [EmailTemplate.REDEMPTION_FAILED]: {
    respondentName: 'Saepudin',
    rewardType: 'Pulsa Rp 25.000',
    pointsRefunded: 2500,
    destinationNumber: '081234567890',
    reason: 'Nomor tidak aktif',
    remainingBalance: 10250,
  },
  [EmailTemplate.OTP_VERIFICATION]: {
    recipientName: 'Saepudin',
    otpCode: '482913',
    expiresInMinutes: 15,
  },
  [EmailTemplate.PASSWORD_RESET]: {
    recipientName: 'Saepudin',
    resetLink: `${APP}/auth/reset-password?token=abc123`,
    expiresInHours: 1,
  },
  [EmailTemplate.ANNOUNCEMENT]: {
    respondentName: 'Saepudin',
    title: 'Pemeliharaan sistem',
    body: 'Paragraf satu.\n\nParagraf dua.',
    actionUrl: `${APP}/notifications`,
  },
};

const ALL_TEMPLATES = Object.values(EmailTemplate);

describe('EmailTemplateService', () => {
  let service: EmailTemplateService;

  beforeEach(() => {
    vi.stubEnv('APP_URL', `${APP}/`);
    service = new EmailTemplateService();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe('renderTemplate', () => {
    it('should throw error for unknown template', () => {
      expect(() => service.renderTemplate('unknown' as EmailTemplate, {})).toThrow(
        'Unknown email template',
      );
    });
  });

  describe('layout (semua template)', () => {
    it.each(ALL_TEMPLATES)('%s: dokumen email lengkap dengan brand, preheader, dan footer', (t) => {
      const { html, text, subject } = service.renderTemplate(t, MINIMAL[t]);

      expect(html.startsWith('<!DOCTYPE html>')).toBe(true);
      expect(html).toContain('<meta name="color-scheme" content="light">');
      expect(html).toContain('role="presentation"');
      expect(html).toContain('max-width:600px');
      // Logo absolut dari APP_URL (garis miring di akhir dibuang).
      expect(html).toContain(`src="${APP}/logo-populi-center-192.png"`);
      expect(html).toContain('Populi Center');
      // Preheader tersembunyi.
      expect(html).toMatch(/<div style="display:none;[^"]*mso-hide:all;[^"]*">[^<]+/);
      // Footer: alasan menerima email + kebijakan privasi + tahun.
      expect(html).toContain('Anda menerima email ini karena terdaftar di Riset Populi Center.');
      expect(html).toContain(`href="${APP}/kebijakan-privasi"`);
      expect(html).toContain(`© ${new Date().getFullYear()} Populi Center`);
      expect(text).toContain(`Kebijakan Privasi: ${APP}/kebijakan-privasi`);
      // Tidak ada tautan berhenti berlangganan palsu.
      expect(html.toLowerCase()).not.toContain('berhenti berlangganan');
      expect(html.toLowerCase()).not.toContain('unsubscribe');
      // Gaya lama (gradien indigo) sudah tidak dipakai; tanpa emoji di subjek & badan.
      expect(html).not.toContain('gradient');
      expect(html).not.toMatch(/#4f46e5|#6366f1|#4338ca/i);
      // (Emoji_Presentation, bukan Extended_Pictographic, agar "©" tidak ikut terhitung.)
      expect(`${subject}${html}${text}`).not.toMatch(/[\p{Emoji_Presentation}\u{FE0F}]/u);
      // Nilai kosong tidak bocor sebagai teks.
      expect(html).not.toMatch(/undefined|NaN|\bnull\b/);
      expect(text).not.toMatch(/undefined|NaN|\bnull\b/);
      // Versi teks polos bebas tag HTML.
      expect(text).not.toMatch(/<[a-z!/][^>]*>/i);
    });

    it.each(ALL_TEMPLATES)('%s: gaya subjek seragam (tanpa em dash dan akhiran brand)', (t) => {
      const { subject } = service.renderTemplate(t, MINIMAL[t]);

      expect(subject).not.toContain('—');
      expect(subject).not.toContain('Populi Center');
      expect(subject).toMatch(/^[A-Z]/);
    });

    it.each(ALL_TEMPLATES)(
      '%s: context kosong tidak melempar dan tidak membocorkan nilai kosong',
      (t) => {
        const { html, text, subject } = service.renderTemplate(t, {});

        expect(subject.trim()).not.toBe('');
        expect(subject).not.toMatch(/""|: *$/);
        for (const out of [subject, html, text]) {
          expect(out).not.toMatch(/undefined|NaN|\bnull\b/);
        }
      },
    );
  });

  describe('SURVEY_INVITATION template', () => {
    it('should render survey invitation with all fields', () => {
      const result = service.renderTemplate(EmailTemplate.SURVEY_INVITATION, {
        respondentName: 'John',
        surveyTitle: 'Customer Satisfaction',
        surveyDescription: 'Help us improve',
        deadline: '2026-06-01',
        surveyUrl: 'https://app.test/surveys/1/fill',
        rewardInfo: '5000 poin',
      });

      expect(result.subject).toContain('Customer Satisfaction');
      expect(result.html).toContain('John');
      expect(result.html).toContain('Customer Satisfaction');
      expect(result.html).toContain('Help us improve');
      expect(result.html).toContain('1 Juni 2026');
      expect(result.html).toContain('href="https://app.test/surveys/1/fill"');
      expect(result.html).toContain('Isi survei sekarang');
      // Hadiah "N poin" tampil sebagai angka besar berformat id-ID.
      expect(result.html).toContain('>5.000<span');
      expect(result.text).toContain('Hadiah setelah selesai: 5.000 poin');
      expect(result.text).toContain('John');
      expect(result.text).toContain('Customer Satisfaction');
      expect(result.text).toContain('Batas waktu: 1 Juni 2026');
      expect(result.text).toContain('https://app.test/surveys/1/fill');
    });

    it('hadiah poin yang sudah berformat tidak diformat ulang', () => {
      const result = service.renderTemplate(EmailTemplate.SURVEY_INVITATION, {
        ...MINIMAL[EmailTemplate.SURVEY_INVITATION],
        rewardInfo: '12.500 poin',
      });

      expect(result.text).toContain('Hadiah setelah selesai: 12.500 poin');
      expect(result.html).toContain('Hadiah 12.500 poin.');
    });

    it('menampilkan hadiah berupa teks bebas sebagai baris rincian', () => {
      const result = service.renderTemplate(EmailTemplate.SURVEY_INVITATION, {
        ...MINIMAL[EmailTemplate.SURVEY_INVITATION],
        rewardInfo: 'Pulsa Rp 10.000 untuk 100 pengisi pertama',
      });

      expect(result.html).toContain('Pulsa Rp 10.000 untuk 100 pengisi pertama');
      expect(result.text).toContain('Hadiah: Pulsa Rp 10.000 untuk 100 pengisi pertama');
    });

    it('should render without optional fields', () => {
      const result = service.renderTemplate(EmailTemplate.SURVEY_INVITATION, {
        respondentName: 'John',
        surveyTitle: 'Survey',
        deadline: '2026-06-01',
        surveyUrl: 'https://app.test/surveys/1/fill',
      });

      expect(result.subject).toContain('Survey');
      expect(result.html).toContain('John');
      expect(result.html).not.toContain('undefined');
      expect(result.html).not.toContain('Hadiah');
      expect(result.text).not.toContain('Hadiah');
    });

    it('shows "Tidak ada batas waktu" when deadline is empty (bukan label kosong)', () => {
      const result = service.renderTemplate(EmailTemplate.SURVEY_INVITATION, {
        respondentName: 'John',
        surveyTitle: 'Survey',
        deadline: '',
        surveyUrl: 'https://app.test/surveys/1/fill',
      });

      expect(result.html).toContain('Tidak ada batas waktu');
      expect(result.text).toContain('Batas waktu: Tidak ada batas waktu');
    });

    it('memotong deskripsi yang sangat panjang', () => {
      const result = service.renderTemplate(EmailTemplate.SURVEY_INVITATION, {
        ...MINIMAL[EmailTemplate.SURVEY_INVITATION],
        surveyDescription: 'kata '.repeat(200),
      });

      expect(result.html).toContain('…');
      expect(result.html).not.toContain('kata '.repeat(80));
    });

    it('menyapa tanpa nama bila nama kosong', () => {
      const result = service.renderTemplate(EmailTemplate.SURVEY_INVITATION, {
        ...MINIMAL[EmailTemplate.SURVEY_INVITATION],
        respondentName: '',
      });

      expect(result.html).toContain('>Halo,<');
      expect(result.text).toContain('Halo,');
    });
  });

  describe('REMINDER templates', () => {
    it('should render H-3 reminder', () => {
      const result = service.renderTemplate(EmailTemplate.REMINDER_H3, {
        respondentName: 'Jane',
        surveyTitle: 'Survey X',
        daysRemaining: 3,
        deadline: '2026-06-01',
        surveyUrl: 'https://app.test/surveys/1/fill',
      });

      expect(result.subject).toContain('3 hari');
      expect(result.subject).toContain('Survey X');
      expect(result.html).toContain('Jane');
      expect(result.html).toContain('3 hari');
      expect(result.html).toContain('Survey X');
      expect(result.html).toContain('Ditutup 1 Juni 2026');
      expect(result.text).toContain('Sisa waktu: 3 hari lagi');
      expect(result.text).toContain('https://app.test/surveys/1/fill');
    });

    it('should render H-1 reminder', () => {
      const result = service.renderTemplate(EmailTemplate.REMINDER_H1, {
        respondentName: 'Jane',
        surveyTitle: 'Survey X',
        daysRemaining: 1,
        deadline: '2026-06-01',
        surveyUrl: 'https://app.test/surveys/1/fill',
      });

      expect(result.subject).toContain('1 hari');
      expect(result.html).toContain('1 hari');
      expect(result.html).toContain('Kesempatan terakhir');
    });

    it('tanpa batas waktu: tidak menulis tanggal penutupan', () => {
      const result = service.renderTemplate(EmailTemplate.REMINDER_H3, {
        ...MINIMAL[EmailTemplate.REMINDER_H3],
        deadline: '',
      });

      expect(result.html).not.toContain('Ditutup');
      expect(result.text).not.toContain('Ditutup');
    });
  });

  describe('SUBMISSION_CONFIRMATION template', () => {
    it('should render with points earned', () => {
      const result = service.renderTemplate(EmailTemplate.SUBMISSION_CONFIRMATION, {
        respondentName: 'User',
        surveyTitle: 'Survey',
        submittedAt: '07/05/2026 10:00',
        pointsEarned: 5000,
      });

      expect(result.subject).toBe('Terima kasih! Jawaban Anda untuk "Survey" sudah diterima');
      expect(result.html).toContain('+5.000');
      expect(result.html).toContain(`href="${APP}/rewards"`);
      expect(result.text).toContain('Poin survei ini: +5.000 poin');
    });

    it('tidak menyatakan poin "sudah masuk" (kredit berjalan terpisah, bisa kena pengali streak)', () => {
      const result = service.renderTemplate(EmailTemplate.SUBMISSION_CONFIRMATION, {
        ...MINIMAL[EmailTemplate.SUBMISSION_CONFIRMATION],
      });

      expect(result.subject).not.toMatch(/poin|masuk/);
      for (const out of [result.html, result.text]) {
        expect(out).not.toContain('Sudah masuk');
        expect(out).not.toContain('sudah masuk');
        expect(out).toContain('Akan masuk ke saldo Anda');
      }
    });

    it('waktu kiriman dari toLocaleString("id-ID") ditulis ulang sebagai tanggal panjang WIB', () => {
      // Persis cara pemanggil membentuknya (waktu lokal proses, zona apa pun).
      const submittedAt = new Date('2026-11-09T07:32:10Z').toLocaleString('id-ID');
      const result = service.renderTemplate(EmailTemplate.SUBMISSION_CONFIRMATION, {
        ...MINIMAL[EmailTemplate.SUBMISSION_CONFIRMATION],
        submittedAt,
      });

      // HTML: "WIB" menempel pada jam (&nbsp;) agar tidak terpisah sendirian di HP.
      expect(result.html).toContain('9 November 2026, 14.32&nbsp;WIB');
      expect(result.text).toContain('Dikirim pada: 9 November 2026, 14.32 WIB');
      expect(result.html).not.toContain('14.32.10');
    });

    it('waktu kiriman ISO juga diubah ke WIB; format tak dikenal ditampilkan apa adanya', () => {
      const iso = service.renderTemplate(EmailTemplate.SUBMISSION_CONFIRMATION, {
        ...MINIMAL[EmailTemplate.SUBMISSION_CONFIRMATION],
        submittedAt: '2026-11-09T17:05:00.000Z',
      });
      expect(iso.text).toContain('Dikirim pada: 10 November 2026, 00.05 WIB');

      const other = service.renderTemplate(EmailTemplate.SUBMISSION_CONFIRMATION, {
        ...MINIMAL[EmailTemplate.SUBMISSION_CONFIRMATION],
        submittedAt: 'Senin pagi',
      });
      expect(other.text).toContain('Dikirim pada: Senin pagi');

      const invalid = service.renderTemplate(EmailTemplate.SUBMISSION_CONFIRMATION, {
        ...MINIMAL[EmailTemplate.SUBMISSION_CONFIRMATION],
        submittedAt: '31/2/2026, 10.00.00',
      });
      expect(invalid.text).toContain('Dikirim pada: 31/2/2026, 10.00.00');
    });

    it('tanpa waktu kiriman: baris "Dikirim pada" tidak dirender', () => {
      const result = service.renderTemplate(EmailTemplate.SUBMISSION_CONFIRMATION, {
        ...MINIMAL[EmailTemplate.SUBMISSION_CONFIRMATION],
        submittedAt: '',
      });

      expect(result.html).not.toContain('Dikirim pada');
      expect(result.text).not.toContain('Dikirim pada');
    });

    it('should render without points earned', () => {
      const result = service.renderTemplate(EmailTemplate.SUBMISSION_CONFIRMATION, {
        respondentName: 'User',
        surveyTitle: 'Survey',
        submittedAt: '07/05/2026 10:00',
      });

      expect(result.subject).not.toContain('poin');
      expect(result.html).not.toContain('poin');
      expect(result.text).not.toContain('poin');
      expect(result.html).toContain(`href="${APP}/surveys"`);
    });
  });

  describe('POINTS_THRESHOLD template', () => {
    it('should render points threshold notification', () => {
      const result = service.renderTemplate(EmailTemplate.POINTS_THRESHOLD, {
        respondentName: 'User',
        currentBalance: 12000,
        threshold: 10000,
        redeemUrl: 'https://app.test/rewards/redeem',
      });

      expect(result.subject).toContain('10.000');
      expect(result.html).toContain('12.000');
      expect(result.text).toContain('Saldo saat ini: 12.000 poin');
      expect(result.text).toContain('sudah mencapai 10.000 poin');
    });

    it('tidak menyebut ambang notifikasi sebagai "minimum penukaran"', () => {
      const result = service.renderTemplate(EmailTemplate.POINTS_THRESHOLD, {
        ...MINIMAL[EmailTemplate.POINTS_THRESHOLD],
      });

      expect(`${result.subject}${result.html}${result.text}`.toLowerCase()).not.toContain(
        'minimum',
      );
    });

    it('tombol ke /rewards, bukan redeemUrl /rewards/redeem yang tidak ada di frontend', () => {
      const result = service.renderTemplate(EmailTemplate.POINTS_THRESHOLD, {
        ...MINIMAL[EmailTemplate.POINTS_THRESHOLD],
        redeemUrl: `${APP}/rewards/redeem`,
      });

      expect(result.html).toContain(`href="${APP}/rewards"`);
      expect(result.html).not.toContain('/rewards/redeem');
      expect(result.text).not.toContain('/rewards/redeem');
    });
  });

  describe('REDEMPTION_CONFIRMATION template', () => {
    it('should render redemption confirmation', () => {
      const result = service.renderTemplate(EmailTemplate.REDEMPTION_CONFIRMATION, {
        respondentName: 'User',
        rewardType: 'Pulsa Telkomsel',
        pointsSpent: 15000,
        destinationNumber: '08123456789',
        remainingBalance: 5000,
      });

      expect(result.subject).toContain('Pulsa Telkomsel');
      expect(result.html).toContain('15.000');
      expect(result.html).toContain('08123456789');
      expect(result.html).toContain('5.000');
      expect(result.text).toContain('Nomor tujuan: 08123456789');
      expect(result.text).toContain('Sisa saldo: 5.000 poin');
    });

    it('tanpa nomor tujuan: baris nomor tujuan tidak dirender', () => {
      const result = service.renderTemplate(EmailTemplate.REDEMPTION_CONFIRMATION, {
        ...MINIMAL[EmailTemplate.REDEMPTION_CONFIRMATION],
        destinationNumber: '',
      });

      expect(result.html).not.toContain('Nomor tujuan');
      expect(result.text).not.toContain('Nomor tujuan');
      // Kalimat pembuka tidak merujuk ke nomor yang tidak ada.
      expect(result.html).not.toContain('di bawah ini');
      expect(result.text).toContain('Penukaran poin Anda berhasil dan reward sudah kami kirim.');
    });

    it('dengan nomor tujuan: kalimat pembuka merujuk ke rincian di bawahnya', () => {
      const result = service.renderTemplate(EmailTemplate.REDEMPTION_CONFIRMATION, {
        ...MINIMAL[EmailTemplate.REDEMPTION_CONFIRMATION],
      });

      expect(result.text).toContain('ke nomor tujuan di bawah ini');
    });

    it('nama reward kosong: judul & subjek tetap utuh', () => {
      const result = service.renderTemplate(EmailTemplate.REDEMPTION_CONFIRMATION, {
        ...MINIMAL[EmailTemplate.REDEMPTION_CONFIRMATION],
        rewardType: '',
      });

      expect(result.subject).toBe('Penukaran berhasil: Reward Anda sudah dikirim');
      expect(result.text).not.toContain('Reward: \n');
    });
  });

  describe('REDEMPTION_FAILED template', () => {
    it('should render refund details and reason', () => {
      const result = service.renderTemplate(EmailTemplate.REDEMPTION_FAILED, {
        respondentName: 'User',
        rewardType: 'Saldo DANA Rp 10.000',
        pointsRefunded: 1000,
        destinationNumber: '08123456789',
        reason: 'Nomor tidak terdaftar',
        remainingBalance: 4000,
      });

      expect(result.subject).toContain('Saldo DANA Rp 10.000');
      expect(result.subject).toContain('dikembalikan');
      expect(result.html).toContain('+1.000');
      expect(result.html).toContain('Saldo sekarang 4.000 poin');
      expect(result.html).toContain('Nomor tidak terdaftar');
      expect(result.text).toContain('Alasan: Nomor tidak terdaftar');
      expect(result.text).toContain('Poin dikembalikan: +1.000 poin');
    });

    it('tanpa alasan: kotak alasan tidak dirender dan saran bersifat umum', () => {
      const result = service.renderTemplate(EmailTemplate.REDEMPTION_FAILED, {
        ...MINIMAL[EmailTemplate.REDEMPTION_FAILED],
        reason: '',
      });

      expect(result.html).not.toContain('Alasan');
      expect(result.text).not.toContain('Alasan');
      expect(result.text).not.toContain('Periksa kembali nomor tujuan');
      expect(result.text).toContain('Anda bisa mencoba menukar lagi dari aplikasi.');
    });

    it('alasan terkait nomor: saran memeriksa nomor tujuan', () => {
      const result = service.renderTemplate(EmailTemplate.REDEMPTION_FAILED, {
        ...MINIMAL[EmailTemplate.REDEMPTION_FAILED],
        reason: 'Nomor tujuan tidak aktif atau tidak terdaftar pada operator.',
      });

      expect(result.text).toContain(
        'Alasan: Nomor tujuan tidak aktif atau tidak terdaftar pada operator.',
      );
      expect(result.text).toContain('Periksa kembali nomor tujuan Anda');
    });

    it('pesan teknis provider tidak ditampilkan mentah (nama provider, kode rc)', () => {
      const result = service.renderTemplate(EmailTemplate.REDEMPTION_FAILED, {
        ...MINIMAL[EmailTemplate.REDEMPTION_FAILED],
        reason: 'Transaksi ditolak provider (IAK rc=17).',
      });

      for (const out of [result.html, result.text]) {
        expect(out).not.toContain('IAK');
        expect(out).not.toContain('rc=17'); // (bukan 'rc=': cocok dengan atribut src=)
        expect(out).not.toContain('provider');
        expect(out).not.toContain('Periksa kembali nomor tujuan');
      }
      expect(result.text).toContain(
        'Alasan: Penyedia layanan belum dapat memproses penukaran ini.',
      );
    });

    it('pesan provider berbahasa Inggris soal nomor diganti teks ramah', () => {
      const result = service.renderTemplate(EmailTemplate.REDEMPTION_FAILED, {
        ...MINIMAL[EmailTemplate.REDEMPTION_FAILED],
        reason: 'INCORRECT DESTINATION NUMBER',
      });

      expect(result.html).not.toContain('INCORRECT');
      expect(result.text).toContain(
        'Alasan: Nomor tujuan tidak valid atau tidak dapat menerima reward ini.',
      );
      expect(result.text).toContain('Periksa kembali nomor tujuan Anda');
    });

    it('pembatalan oleh admin: alasan tampil, tanpa saran memeriksa nomor', () => {
      const result = service.renderTemplate(EmailTemplate.REDEMPTION_FAILED, {
        ...MINIMAL[EmailTemplate.REDEMPTION_FAILED],
        reason: 'Dibatalkan oleh admin.',
      });

      expect(result.text).toContain('Alasan: Dibatalkan oleh admin.');
      expect(result.text).not.toContain('Periksa kembali nomor tujuan');
    });
  });

  describe('OTP_VERIFICATION template', () => {
    it('should render OTP email', () => {
      const result = service.renderTemplate(EmailTemplate.OTP_VERIFICATION, {
        recipientName: 'User',
        otpCode: '123456',
        expiresInMinutes: 15,
      });

      // Subjek & preheader sengaja TIDAK memuat kode (keamanan/deliverability).
      expect(result.subject).toBe('Kode verifikasi akun Anda');
      expect(result.subject).not.toContain('123456');
      expect(result.html.match(/123456/g)).toHaveLength(1);
      expect(result.html).toContain('15 menit');
      expect(result.text).toContain('Kode: 123456');
    });

    it('should render reset-purpose OTP with reset wording', () => {
      const result = service.renderTemplate(EmailTemplate.OTP_VERIFICATION, {
        recipientName: 'User',
        otpCode: '654321',
        expiresInMinutes: 15,
        purpose: 'reset',
      });

      expect(result.subject).toBe('Kode untuk mengatur ulang kata sandi');
      expect(result.subject).not.toContain('654321');
      expect(result.html).toContain('654321');
      expect(result.text.toLowerCase()).toContain('kata sandi');
    });

    it('should render redeem-purpose OTP with redemption wording', () => {
      const result = service.renderTemplate(EmailTemplate.OTP_VERIFICATION, {
        recipientName: 'User',
        otpCode: '777888',
        expiresInMinutes: 10,
        purpose: 'redeem',
      });

      expect(result.subject).toBe('Kode konfirmasi penukaran poin');
      expect(result.subject).not.toContain('777888');
      expect(result.html).toContain('777888');
      expect(result.html).toContain('10 menit');
      expect(result.text).toContain('ganti kata sandi');
    });
  });

  describe('PASSWORD_RESET template', () => {
    it('should render password reset email', () => {
      const result = service.renderTemplate(EmailTemplate.PASSWORD_RESET, {
        recipientName: 'User',
        resetLink: 'https://app.test/auth/reset-password?token=abc123',
        expiresInHours: 1,
      });

      expect(result.subject).toBe('Atur ulang kata sandi Anda');
      expect(result.html).toContain('href="https://app.test/auth/reset-password?token=abc123"');
      expect(result.html).toContain('1 jam');
      expect(result.text).toContain('https://app.test/auth/reset-password?token=abc123');
    });
  });

  describe('ANNOUNCEMENT template', () => {
    it('merender paragraf, baris baru, dan tombol', () => {
      const result = service.renderTemplate(EmailTemplate.ANNOUNCEMENT, {
        respondentName: 'User',
        title: 'Info Penting',
        body: 'Paragraf satu.\n\nBaris A\nBaris B',
        actionUrl: 'https://app.test/notifications',
      });

      expect(result.subject).toBe('Info Penting');
      expect(result.html).toContain('Paragraf satu.</p>');
      expect(result.html).toContain('Baris A<br>Baris B');
      expect(result.html).toContain('href="https://app.test/notifications"');
      expect(result.text).toContain('Paragraf satu.\n\nBaris A\nBaris B');
    });

    it('tanpa actionUrl: tombol tidak dirender', () => {
      const result = service.renderTemplate(EmailTemplate.ANNOUNCEMENT, {
        respondentName: 'User',
        title: 'Info',
        body: 'Isi',
      });

      expect(result.html).not.toContain('Buka di aplikasi');
      expect(result.text).not.toContain('Buka di aplikasi');
    });
  });

  describe('escape HTML nilai dinamis', () => {
    const XSS = '<script>alert(1)</script>';
    const cases: Array<[EmailTemplate, Record<string, unknown>]> = [
      [
        EmailTemplate.SURVEY_INVITATION,
        {
          respondentName: XSS,
          surveyTitle: XSS,
          surveyDescription: XSS,
          rewardInfo: XSS,
          deadline: '2026-06-01',
          surveyUrl: `${APP}/s`,
        },
      ],
      [
        EmailTemplate.REMINDER_H3,
        { ...MINIMAL[EmailTemplate.REMINDER_H3], respondentName: XSS, surveyTitle: XSS },
      ],
      [
        EmailTemplate.SUBMISSION_CONFIRMATION,
        {
          respondentName: XSS,
          surveyTitle: XSS,
          submittedAt: XSS,
          pointsEarned: 10,
        },
      ],
      [
        EmailTemplate.REDEMPTION_CONFIRMATION,
        {
          ...MINIMAL[EmailTemplate.REDEMPTION_CONFIRMATION],
          respondentName: XSS,
          rewardType: XSS,
          destinationNumber: XSS,
        },
      ],
      [
        EmailTemplate.REDEMPTION_FAILED,
        {
          ...MINIMAL[EmailTemplate.REDEMPTION_FAILED],
          respondentName: XSS,
          rewardType: XSS,
          destinationNumber: XSS,
          reason: XSS,
        },
      ],
      [EmailTemplate.OTP_VERIFICATION, { recipientName: XSS, otpCode: XSS, expiresInMinutes: 5 }],
      [
        EmailTemplate.ANNOUNCEMENT,
        { respondentName: XSS, title: XSS, body: `${XSS}\n\n"kutip" & 'apos'` },
      ],
    ];

    it.each(cases)('%s: tidak ada tag mentah dari input', (template, context) => {
      const { html } = service.renderTemplate(template, context);

      expect(html).not.toContain('<script>');
      expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    });

    it('meng-escape tanda kutip dan ampersand pada pengumuman', () => {
      const { html } = service.renderTemplate(EmailTemplate.ANNOUNCEMENT, {
        respondentName: 'User',
        title: 'A & B',
        body: `"kutip" & 'apos'`,
      });

      expect(html).toContain('A &amp; B');
      expect(html).toContain('&quot;kutip&quot; &amp; &#39;apos&#39;');
    });

    it('subjek tetap satu baris walau judul memuat baris baru', () => {
      const { subject } = service.renderTemplate(EmailTemplate.ANNOUNCEMENT, {
        respondentName: 'User',
        title: 'Baris satu\nBaris dua',
        body: 'Isi',
      });

      expect(subject).toBe('Baris satu Baris dua');
    });
  });

  describe('keamanan tautan', () => {
    it.each(['javascript:alert(1)', 'data:text/html,<b>x</b>', '//evil.test/x', 'not a url'])(
      'menolak URL tidak aman "%s" (tombol tidak dirender)',
      (url) => {
        const result = service.renderTemplate(EmailTemplate.SURVEY_INVITATION, {
          ...MINIMAL[EmailTemplate.SURVEY_INVITATION],
          surveyUrl: url,
        });

        expect(result.html).not.toContain('Isi survei sekarang');
        expect(result.html).not.toContain(url);
        expect(result.text).not.toContain(url);
      },
    );

    it('path relatif diawali APP_URL', () => {
      const result = service.renderTemplate(EmailTemplate.ANNOUNCEMENT, {
        respondentName: 'User',
        title: 'Info',
        body: 'Isi',
        actionUrl: '/surveys',
      });

      expect(result.html).toContain(`href="${APP}/surveys"`);
      expect(result.text).toContain(`${APP}/surveys`);
    });

    // Pemanggil menyusun actionUrl = `${baseUrl}${dto.link}` dari teks bebas admin.
    it.each([
      [`${APP}@evil.test/login`, 'userinfo: host sebenarnya evil.test'],
      [`${APP}.evil.test/x`, 'subdomain milik host lain'],
      ['https://evil.test/notifications', 'host lain'],
      [`https://user:pass@app.test/notifications`, 'userinfo pada host sendiri'],
    ])('pengumuman menolak tautan di luar aplikasi "%s" (%s)', (actionUrl) => {
      const result = service.renderTemplate(EmailTemplate.ANNOUNCEMENT, {
        ...MINIMAL[EmailTemplate.ANNOUNCEMENT],
        actionUrl,
      });

      expect(result.html).not.toContain('Buka di aplikasi');
      expect(result.html).not.toContain('evil.test');
      expect(result.text).not.toContain('evil.test');
      expect(result.text).not.toContain('user:pass');
    });

    it('pengumuman menerima origin APP_BASE_URL (basis tautan email pemanggil)', () => {
      vi.stubEnv('APP_BASE_URL', 'http://localhost:3000');
      const result = service.renderTemplate(EmailTemplate.ANNOUNCEMENT, {
        ...MINIMAL[EmailTemplate.ANNOUNCEMENT],
        actionUrl: 'http://localhost:3000/surveys',
      });

      expect(result.html).toContain('href="http://localhost:3000/surveys"');
    });

    it('tautan survei tetap menerima http(s) absolut (perilaku safeUrl tidak berubah)', () => {
      const result = service.renderTemplate(EmailTemplate.SURVEY_INVITATION, {
        ...MINIMAL[EmailTemplate.SURVEY_INVITATION],
        surveyUrl: 'https://other.test/surveys/1/fill',
      });

      expect(result.html).toContain('href="https://other.test/surveys/1/fill"');
    });

    it('meng-escape karakter khusus pada href', () => {
      const result = service.renderTemplate(EmailTemplate.PASSWORD_RESET, {
        recipientName: 'User',
        resetLink: 'https://app.test/reset?a=1&b="2"',
        expiresInHours: 1,
      });

      expect(result.html).toContain('href="https://app.test/reset?a=1&amp;b=%222%22"');
      expect(result.html).not.toContain('b="2"');
    });
  });
});
