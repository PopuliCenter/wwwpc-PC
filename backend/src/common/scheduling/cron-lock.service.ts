import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { hostname } from 'os';

/**
 * Kunci terdistribusi untuk job @Cron saat backend berjalan MULTI-REPLIKA.
 *
 * Tanpa ini, setiap replika menjalankan semua @Cron pada jadwal yang sama →
 * reminder H-3/H-1 terkirim DOBEL ke responden, purge/expiry jalan ganda.
 * Dengan ini, semua replika tetap "bangun" sesuai jadwal, tetapi hanya yang
 * pertama memenangkan SET NX yang benar-benar mengeksekusi; sisanya skip.
 *
 * Sifat kunci:
 * - `SET key <instanceId> NX PX <ttl>` — atomik di Redis, aman lintas proses.
 * - Kunci TIDAK dilepas setelah job selesai — dibiarkan kedaluwarsa via TTL.
 *   Ini disengaja: melepas lebih awal membuka celah replika lain (yang tick
 *   cron-nya terlambat beberapa detik) ikut menjalankan job yang sama.
 * - Redis bermasalah → FAIL-CLOSED (job dilewati + log error). Lebih aman
 *   job uang/email tertunda satu siklus daripada berjalan ganda.
 */
@Injectable()
export class CronLockService implements OnModuleDestroy {
  private readonly logger = new Logger(CronLockService.name);
  private readonly client: Redis;
  /** Identitas replika ini — tersimpan sebagai nilai kunci (bantu debugging). */
  private readonly instanceId = `${hostname()}:${process.pid}:${randomUUID().slice(0, 8)}`;

  constructor(configService: ConfigService) {
    this.client = new Redis({
      host: configService.get<string>('redis.host'),
      port: configService.get<number>('redis.port'),
      password: configService.get<string>('redis.password'),
      db: configService.get<number>('redis.db'),
      keyPrefix: configService.get<string>('redis.keyPrefix'),
      // Jangan antre perintah tanpa batas saat Redis down — biarkan gagal cepat
      // (fail-closed) alih-alih menumpuk lalu meledak bersamaan saat pulih.
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
    });
    // lazyConnect + connect() manual: error koneksi awal tidak mematikan boot.
    this.client.connect().catch((err: Error) => {
      this.logger.warn(`Koneksi Redis cron-lock tertunda: ${err.message}`);
    });
    this.client.on('error', () => {
      /* dicatat per-acquire; listener kosong mencegah unhandled error event */
    });
  }

  /**
   * Coba ambil kunci eksklusif `name` selama `ttlMs`. Return true bila replika
   * ini pemenangnya (silakan eksekusi job); false bila replika lain sudah
   * memegangnya ATAU Redis tidak dapat dihubungi (fail-closed).
   */
  async acquire(name: string, ttlMs: number): Promise<boolean> {
    try {
      const res = await this.client.set(`cron-lock:${name}`, this.instanceId, 'PX', ttlMs, 'NX');
      return res === 'OK';
    } catch (err) {
      this.logger.error(
        `Gagal mengambil kunci cron "${name}" — job dilewati siklus ini: ${(err as Error).message}`,
      );
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit().catch(() => this.client.disconnect());
  }
}

/** TTL kunci untuk job harian/bulanan (jauh > skew jam antar-replika). */
export const CRON_LOCK_TTL_DAILY_MS = 10 * 60 * 1000;
/** TTL kunci untuk job per-menit — harus < 60 dtk agar siklus berikut bisa jalan. */
export const CRON_LOCK_TTL_MINUTE_MS = 55 * 1000;
