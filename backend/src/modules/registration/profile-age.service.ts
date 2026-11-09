import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { CronLockService, CRON_LOCK_TTL_DAILY_MS } from '../../common/scheduling/cron-lock.service';

/** WIB = UTC+7 sepanjang tahun (Indonesia tidak memakai DST). */
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/**
 * Tanggal kalender hari ini di WIB ("YYYY-MM-DD"), lepas dari TZ proses
 * maupun TZ sesi Postgres (yang di VPS = UTC, sehingga CURRENT_DATE pada
 * 00.00–07.00 WIB masih menunjuk hari kemarin).
 *
 * WIB dipakai karena zona paling barat: saat 00.00 WIB, tanggal yang sama
 * sudah berjalan di WITA/WIT, jadi tak ada responden yang naik umur sebelum
 * hari ulang tahunnya tiba.
 */
export function todayInJakarta(now: Date = new Date()): string {
  return new Date(now.getTime() + WIB_OFFSET_MS).toISOString().slice(0, 10);
}

/** Umur penuh pada tanggal `$1`, dihitung Postgres dari tanggal lahir. */
const AGE_ON_DATE_SQL = `date_part('year', age($1::date::timestamp, "date_of_birth"::timestamp))::int`;

/**
 * Menjaga `user_profile.age` selalu sesuai tanggal lahir.
 *
 * Kolom `age` disimpan karena dipakai banyak tempat (daftar responden,
 * distribusi dashboard, filter respons, export), tetapi sebelumnya hanya
 * dihitung saat daftar/lengkapi profil sehingga membeku di umur waktu daftar.
 * Job ini menghitung ulang dari `date_of_birth` setiap 00.00 WIB, ditambah
 * sekali saat backend menyala agar malam yang terlewat (deploy/restart)
 * langsung tersusul.
 *
 * Hanya baris yang nilainya berubah yang ditulis, sehingga aman diulang dan
 * otomatis menyusul berapa pun hari yang terlewat. Profil tanpa tanggal lahir
 * (data lama yang hanya punya `age`) dibiarkan apa adanya.
 */
@Injectable()
export class ProfileAgeService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ProfileAgeService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly cronLock: CronLockService,
  ) {}

  onApplicationBootstrap(): void {
    // Jangan menahan boot. Kunci dipisah dari job harian agar boot menjelang
    // tengah malam tidak "menelan" jadwal 00.00.
    void this.runExclusive('profile-age-boot');
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT, {
    name: 'profile-age-refresh',
    timeZone: 'Asia/Jakarta',
  })
  async handleDailyRefresh(): Promise<void> {
    await this.runExclusive('profile-age-daily');
  }

  /**
   * Samakan `age` dengan umur pada tanggal `today` (default: hari ini WIB).
   * Mengembalikan jumlah profil yang umurnya berubah.
   */
  async refreshAges(today: string = todayInJakarta()): Promise<number> {
    const result: unknown = await this.dataSource.query(
      `UPDATE "user_profile"
          SET "age" = ${AGE_ON_DATE_SQL}
        WHERE "date_of_birth" IS NOT NULL
          AND "age" IS DISTINCT FROM ${AGE_ON_DATE_SQL}`,
      [today],
    );
    // Driver Postgres TypeORM mengembalikan [rows, rowCount] untuk UPDATE.
    return Array.isArray(result) && typeof result[1] === 'number' ? result[1] : 0;
  }

  private async runExclusive(lockName: string): Promise<void> {
    try {
      // Multi-replika: hanya satu replika yang menjalankan.
      if (!(await this.cronLock.acquire(lockName, CRON_LOCK_TTL_DAILY_MS))) return;
      const today = todayInJakarta();
      const updated = await this.refreshAges(today);
      if (updated > 0) {
        this.logger.log(`Umur ${updated} responden diperbarui sesuai tanggal lahir (${today}).`);
      }
    } catch (err) {
      this.logger.error(`Gagal memperbarui umur responden: ${(err as Error).message}`);
    }
  }
}
