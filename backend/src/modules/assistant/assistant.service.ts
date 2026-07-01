import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Asisten bantuan (chatbot) bertenaga Cloudflare Workers AI (gratis, model
 * Llama). Dipakai sebagai FALLBACK saat FAQ tak menemukan jawaban. Jawaban
 * dibatasi ke konteks aplikasi Survei Populi lewat system prompt.
 *
 * Konfigurasi (backend/.env):
 *   CF_ACCOUNT_ID   = id akun Cloudflare
 *   CF_AI_API_TOKEN = API token dgn izin "Workers AI"
 *   CF_AI_MODEL     = (opsional) default '@cf/meta/llama-3.1-8b-instruct'
 */
@Injectable()
export class AssistantService {
  private readonly logger = new Logger(AssistantService.name);

  constructor(private readonly config: ConfigService) {}

  private get systemPrompt(): string {
    return [
      'Anda adalah "Asisten Populi", asisten bantuan untuk aplikasi survei online Survei Populi.',
      'Jawab HANYA seputar penggunaan aplikasi ini, dalam Bahasa Indonesia yang singkat, ramah, dan jelas (maksimal ~4 kalimat).',
      'Konteks aplikasi:',
      '- Pengguna mengisi survei untuk mendapat POIN. Poin masuk setelah survei terkirim.',
      '- Poin ditukar di tab Reward menjadi PULSA atau E-WALLET (GoPay/OVO/DANA). Pulsa hanya untuk nomor PRABAYAR. Jika penukaran gagal, poin dikembalikan otomatis.',
      '- Status penukaran ada di Reward > Riwayat Penukaran.',
      '- Data diri diubah di tab Profil > Ubah Data Diri. Sebagian data (tanggal lahir, jenis kelamin, wilayah KTP) dikunci.',
      '- Akun bisa dihapus di Profil > Hapus Akun.',
      '- Data pengguna hanya untuk riset, tidak diperjualbelikan.',
      'Aturan penting:',
      '- JANGAN PERNAH meminta password, kode OTP, PIN, atau data sensitif.',
      '- Jika pertanyaan di luar topik aplikasi, atau butuh tindakan pada akun spesifik (mis. cek saldo, koreksi data terkunci), arahkan menghubungi WhatsApp 0812-9206-8362 atau email info@populicenter.org.',
      '- Jangan mengarang fitur yang tidak disebutkan. Bila tidak yakin, sarankan menghubungi tim dukungan.',
    ].join('\n');
  }

  /** True bila Cloudflare AI dikonfigurasi. */
  isConfigured(): boolean {
    return Boolean(
      this.config.get<string>('CF_ACCOUNT_ID') && this.config.get<string>('CF_AI_API_TOKEN'),
    );
  }

  /**
   * Tanya asisten. Mengembalikan teks jawaban, atau null bila belum
   * dikonfigurasi / gagal (pemanggil mengarahkan ke kontak manusia).
   */
  async ask(question: string): Promise<string | null> {
    const accountId = this.config.get<string>('CF_ACCOUNT_ID');
    const token = this.config.get<string>('CF_AI_API_TOKEN');
    const model = this.config.get<string>('CF_AI_MODEL') ?? '@cf/meta/llama-3.1-8b-instruct';
    if (!accountId || !token) return null;

    const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messages: [
            { role: 'system', content: this.systemPrompt },
            { role: 'user', content: question },
          ],
          max_tokens: 400,
          temperature: 0.3,
        }),
        signal: AbortSignal.timeout(20000),
      });

      if (!res.ok) {
        this.logger.warn(`Cloudflare AI HTTP ${res.status}`);
        return null;
      }
      const data = (await res.json()) as {
        success?: boolean;
        result?: { response?: string };
      };
      const answer = data?.result?.response?.trim();
      return answer || null;
    } catch (err: any) {
      this.logger.warn(`Cloudflare AI gagal: ${err?.message ?? err}`);
      return null;
    }
  }
}
