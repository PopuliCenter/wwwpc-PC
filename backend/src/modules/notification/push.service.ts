import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { initializeApp, cert, getApps, type App } from 'firebase-admin/app';
import { getMessaging } from 'firebase-admin/messaging';

export interface PushPayload {
  title: string;
  body: string;
  /** Data tambahan (semua nilai harus string). Mis. { link: '/surveys/<id>/fill' }. */
  data?: Record<string, string>;
}

export interface PushResult {
  sent: number;
  /** Token yang tidak valid/kedaluwarsa (untuk dibersihkan pemanggil). */
  failedTokens: string[];
}

/**
 * Pembungkus Firebase Admin (FCM) untuk mengirim push notifikasi ke Android &
 * iOS (APNs lewat FCM). NON-AKTIF dengan aman bila env FIREBASE_SERVICE_ACCOUNT
 * belum diisi — `sendToTokens` mengembalikan 0 tanpa error, sehingga fitur lain
 * (email undangan) tetap jalan sebelum kredensial produksi disiapkan.
 *
 * Env:
 *   FIREBASE_SERVICE_ACCOUNT  JSON service account (string) dari Firebase Console.
 */
@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);
  private app: App | null = null;
  private initTried = false;
  private static readonly APP_NAME = 'survei-push';

  constructor(private readonly config: ConfigService) {}

  /** Inisialisasi Firebase Admin sekali (lazy). Null bila tak terkonfigurasi. */
  private getApp(): App | null {
    if (this.initTried) return this.app;
    this.initTried = true;

    const raw = this.config.get<string>('FIREBASE_SERVICE_ACCOUNT');
    if (!raw) {
      this.logger.warn('FIREBASE_SERVICE_ACCOUNT belum diset — push notifikasi dinonaktifkan.');
      return null;
    }

    try {
      const creds = JSON.parse(raw);
      // Pakai app bernama khusus; pakai ulang bila sudah ada (mis. hot-reload).
      const existing = getApps().find((a) => a.name === PushService.APP_NAME);
      this.app = existing ?? initializeApp({ credential: cert(creds) }, PushService.APP_NAME);
      this.logger.log('Firebase Admin siap — push notifikasi aktif.');
    } catch (e: any) {
      this.logger.error(`Gagal inisialisasi Firebase Admin: ${e.message}`);
      this.app = null;
    }
    return this.app;
  }

  isEnabled(): boolean {
    return this.getApp() !== null;
  }

  /**
   * Kirim ke banyak token. Aman: 0 token / tidak terkonfigurasi → tidak melakukan
   * apa-apa. Mengembalikan jumlah terkirim + daftar token tak valid untuk dihapus.
   */
  async sendToTokens(tokens: string[], payload: PushPayload): Promise<PushResult> {
    const app = this.getApp();
    if (!app || tokens.length === 0) return { sent: 0, failedTokens: [] };

    const messaging = getMessaging(app);
    const failedTokens: string[] = [];
    let sent = 0;

    // FCM multicast: maksimum 500 token per panggilan.
    for (let i = 0; i < tokens.length; i += 500) {
      const batch = tokens.slice(i, i + 500);
      try {
        const res = await messaging.sendEachForMulticast({
          tokens: batch,
          notification: { title: payload.title, body: payload.body },
          data: payload.data ?? {},
          // Prioritas tinggi + channel khusus agar notifikasi muncul HEADS-UP
          // (pop di layar HP) dan berbunyi. channelId HARUS sama dengan channel
          // yang dibuat aplikasi (frontend notifications.ts: 'survei_penting').
          android: {
            priority: 'high',
            notification: {
              channelId: 'survei_penting',
              sound: 'default',
              defaultSound: true,
              priority: 'high',
              defaultVibrateTimings: true,
            },
          },
          apns: {
            payload: { aps: { sound: 'default' } },
          },
        });
        sent += res.successCount;
        res.responses.forEach((r, idx) => {
          if (!r.success) {
            const code = r.error?.code;
            if (
              code === 'messaging/registration-token-not-registered' ||
              code === 'messaging/invalid-argument' ||
              code === 'messaging/invalid-registration-token'
            ) {
              failedTokens.push(batch[idx]);
            }
          }
        });
      } catch (e: any) {
        this.logger.error(`Gagal mengirim batch push: ${e.message}`);
      }
    }

    return { sent, failedTokens };
  }
}
