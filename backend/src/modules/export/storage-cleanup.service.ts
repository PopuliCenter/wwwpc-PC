import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { S3StorageService } from './s3-storage.service';
import { CronLockService, CRON_LOCK_TTL_DAILY_MS } from '../../common/scheduling/cron-lock.service';

/** Objek apa pun yang punya `.query()` (DataSource atau EntityManager transaksi). */
export interface Queryable {
  query(sql: string, params?: unknown[]): Promise<any>;
}

/** Berkas MinIO milik satu user yang harus ikut terhapus bersama akunnya. */
export interface UserObjectPlan {
  userId: string;
  /** Prefix `survey-uploads/<surveyId>/<userId>/` di bucket unggahan. */
  uploadPrefixes: string[];
  /** Key tunggal di bucket unggahan (avatar + berkas yang dirujuk jawaban). */
  uploadKeys: string[];
  /** Key berkas ekspor yang diminta user ini (bucket ekspor). */
  exportKeys: string[];
}

export interface CleanupOutcome {
  deleted: number;
  failed: number;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DAY_MS = 24 * 60 * 60 * 1000;

function envDays(name: string, fallback: number): number {
  const n = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(n) && n >= 1 ? n : fallback;
}

/** Masa simpan berkas ekspor (PII lengkap). Env EXPORT_RETENTION_DAYS, default 7. */
export const exportRetentionDays = () => envDays('EXPORT_RETENTION_DAYS', 7);
/** Masa simpan snapshot `backups/deletion-*.json`. Env DELETION_BACKUP_RETENTION_DAYS, default 30. */
export const deletionBackupRetentionDays = () => envDays('DELETION_BACKUP_RETENTION_DAYS', 30);

/**
 * Penghapusan berkas MinIO yang menyertai penghapusan data (T-16, T-31) +
 * retensi otomatis ekspor/backup + penyapu objek yatim.
 *
 * Pola pakai: kumpulkan key DI DALAM transaksi (sebelum baris dihapus), lalu
 * hapus objeknya SETELAH commit (best-effort). Objek yang gagal terhapus
 * (MinIO sedang mati) disapu oleh cron harian `sweep()`: unggahan/avatar milik
 * user yang sudah tidak ada, ekspor > EXPORT_RETENTION_DAYS, backup >
 * DELETION_BACKUP_RETENTION_DAYS.
 */
@Injectable()
export class StorageCleanupService {
  private readonly logger = new Logger(StorageCleanupService.name);

  constructor(
    private readonly s3: S3StorageService,
    private readonly dataSource: DataSource,
    private readonly cronLock: CronLockService,
  ) {}

  // ── Pengumpulan key (panggil sebelum baris DB dihapus) ─────────────────────

  /**
   * Key unggahan (`survey-uploads/...`) yang dirujuk jawaban dari respons yang
   * cocok dengan `responseWhere` (SQL internal, alias tabel respons = `r`).
   */
  async uploadKeysWhere(
    runner: Queryable,
    responseWhere: string,
    params: unknown[],
  ): Promise<string[]> {
    const rows: Array<{ key: string }> = await runner.query(
      `SELECT DISTINCT a.value #>> '{}' AS key
         FROM answer a
         JOIN survey_response r ON r.id = a.response_id
        WHERE (${responseWhere})
          AND jsonb_typeof(a.value) = 'string'
          AND (a.value #>> '{}') LIKE 'survey-uploads/%'`,
      params,
    );
    return rows.map((r) => r.key).filter(Boolean);
  }

  /** Key unggahan yang dirujuk jawaban satu respons. */
  uploadKeysForResponse(runner: Queryable, responseId: string): Promise<string[]> {
    return this.uploadKeysWhere(runner, 'r.id = $1', [responseId]);
  }

  /** Semua berkas MinIO milik user (unggahan, avatar, ekspor yang ia minta). */
  async planForUser(runner: Queryable, userId: string): Promise<UserObjectPlan> {
    const surveys: Array<{ survey_id: string }> = await runner.query(
      'SELECT DISTINCT survey_id FROM survey_response WHERE respondent_id = $1',
      [userId],
    );
    const referenced = await this.uploadKeysWhere(runner, 'r.respondent_id = $1', [userId]);
    const exports: Array<{ file_path: string }> = await runner.query(
      'SELECT file_path FROM export_job WHERE requested_by = $1 AND file_path IS NOT NULL',
      [userId],
    );
    return {
      userId,
      uploadPrefixes: surveys.map((s) => `survey-uploads/${s.survey_id}/${userId}/`),
      uploadKeys: [`avatars/${userId}`, ...referenced],
      exportKeys: exports.map((e) => S3StorageService.resolveS3Key(e.file_path)),
    };
  }

  // ── Eksekusi (setelah commit) ──────────────────────────────────────────────

  /** Hapus semua berkas di rencana user. Tidak pernah melempar. */
  async executeUserPlan(plan: UserObjectPlan): Promise<CleanupOutcome> {
    const total: CleanupOutcome = { deleted: 0, failed: 0 };
    const add = (o: CleanupOutcome) => {
      total.deleted += o.deleted;
      total.failed += o.failed;
    };
    for (const prefix of plan.uploadPrefixes) {
      add(await this.deletePrefix(prefix, this.s3.uploadsBucket));
    }
    add(await this.deleteKeys(plan.uploadKeys, this.s3.uploadsBucket));
    add(await this.deleteKeys(plan.exportKeys, this.s3.exportsBucket));
    if (total.failed > 0) {
      this.logger.warn(
        `Berkas user ${plan.userId}: ${total.failed} gagal dihapus (disapu cron harian)`,
      );
    }
    return total;
  }

  /** Hapus daftar key unggahan responden. Tidak pernah melempar. */
  deleteUploadKeys(keys: string[]): Promise<CleanupOutcome> {
    return this.deleteKeys(keys, this.s3.uploadsBucket);
  }

  private async deleteKeys(keys: string[], bucket: string): Promise<CleanupOutcome> {
    const out: CleanupOutcome = { deleted: 0, failed: 0 };
    const unique = [...new Set(keys.filter(Boolean))];
    // Konkurensi kecil: cukup cepat tanpa membanjiri MinIO.
    for (let i = 0; i < unique.length; i += 10) {
      const results = await Promise.allSettled(
        unique.slice(i, i + 10).map((k) => this.s3.deleteObject(k, bucket)),
      );
      for (const r of results) {
        if (r.status === 'fulfilled') out.deleted++;
        else out.failed++;
      }
    }
    return out;
  }

  private async deletePrefix(prefix: string, bucket: string): Promise<CleanupOutcome> {
    try {
      const keys: string[] = [];
      for await (const o of this.iterate(bucket, prefix)) keys.push(o.key);
      return await this.deleteKeys(keys, bucket);
    } catch (err) {
      this.logger.warn(`Gagal menelusuri ${prefix}: ${(err as Error).message}`);
      return { deleted: 0, failed: 1 };
    }
  }

  private async *iterate(
    bucket: string,
    prefix: string,
  ): AsyncGenerator<{ key: string; lastModified: Date | null }> {
    let token: string | undefined;
    do {
      const page = await this.s3.listObjects(bucket, prefix, token, 1000);
      for (const o of page.objects) {
        if (o.key)
          yield { key: o.key, lastModified: o.lastModified ? new Date(o.lastModified) : null };
      }
      token = page.nextToken;
    } while (token);
  }

  // ── Retensi & penyapu harian ───────────────────────────────────────────────

  /**
   * Cron harian 03.45 WIB (satu replika, cron-lock):
   *  1. ekspor (`exports/`) > EXPORT_RETENTION_DAYS → objek dihapus, file_path
   *     job dikosongkan (unduhan lama → 404 "berkas tidak ditemukan");
   *  2. snapshot `backups/` > DELETION_BACKUP_RETENTION_DAYS → dihapus;
   *  3. unggahan/avatar milik user yang sudah tidak ada → dihapus.
   */
  @Cron('0 45 3 * * *', { timeZone: 'Asia/Jakarta' })
  async scheduledSweep(): Promise<void> {
    if (!(await this.cronLock.acquire('storage-retention', CRON_LOCK_TTL_DAILY_MS))) return;
    try {
      await this.sweep();
    } catch (err) {
      this.logger.error(`Penyapu penyimpanan gagal: ${(err as Error).message}`);
    }
  }

  async sweep(now = new Date()): Promise<{ exports: number; backups: number; orphans: number }> {
    const exportCutoff = new Date(now.getTime() - exportRetentionDays() * DAY_MS);
    const backupCutoff = new Date(now.getTime() - deletionBackupRetentionDays() * DAY_MS);

    const exportsDeleted = await this.deleteOlderThan(
      this.s3.exportsBucket,
      'exports/',
      exportCutoff,
    );
    await this.dataSource.query(
      `UPDATE export_job SET file_path = NULL
        WHERE file_path IS NOT NULL AND COALESCE(completed_at, created_at) < $1`,
      [exportCutoff],
    );
    const backupsDeleted = await this.deleteOlderThan(
      this.s3.exportsBucket,
      'backups/',
      backupCutoff,
    );
    const orphans = await this.sweepOrphanUploads(new Date(now.getTime() - 60 * 60 * 1000));

    if (exportsDeleted + backupsDeleted + orphans > 0) {
      this.logger.log(
        `Retensi penyimpanan: ${exportsDeleted} ekspor, ${backupsDeleted} backup, ${orphans} berkas yatim dihapus`,
      );
    }
    return { exports: exportsDeleted, backups: backupsDeleted, orphans };
  }

  private async deleteOlderThan(bucket: string, prefix: string, cutoff: Date): Promise<number> {
    const stale: string[] = [];
    for await (const o of this.iterate(bucket, prefix)) {
      if (o.lastModified && o.lastModified < cutoff) stale.push(o.key);
    }
    return (await this.deleteKeys(stale, bucket)).deleted;
  }

  /**
   * Unggahan (`survey-uploads/<survey>/<user>/…`) & avatar (`avatars/<user>`)
   * yang pemiliknya sudah tidak ada di tabel users. Hanya objek lebih tua dari
   * `olderThan` (hindari balapan dengan unggahan yang sedang berjalan) dan
   * hanya segmen user ber-format UUID (key tak dikenal tidak disentuh).
   */
  private async sweepOrphanUploads(olderThan: Date): Promise<number> {
    const bucket = this.s3.uploadsBucket;
    const byUser = new Map<string, string[]>();
    const collect = (userId: string | undefined, key: string) => {
      if (!userId || !UUID_RE.test(userId)) return;
      userId = userId.toLowerCase();
      const list = byUser.get(userId) ?? [];
      list.push(key);
      byUser.set(userId, list);
    };
    for await (const o of this.iterate(bucket, 'survey-uploads/')) {
      if (o.lastModified && o.lastModified < olderThan) collect(o.key.split('/')[2], o.key);
    }
    for await (const o of this.iterate(bucket, 'avatars/')) {
      if (o.lastModified && o.lastModified < olderThan) collect(o.key.split('/')[1], o.key);
    }
    if (byUser.size === 0) return 0;

    const ids = [...byUser.keys()];
    const existing = new Set<string>();
    for (let i = 0; i < ids.length; i += 1000) {
      const rows: Array<{ id: string }> = await this.dataSource.query(
        'SELECT id FROM users WHERE id = ANY($1::uuid[])',
        [ids.slice(i, i + 1000)],
      );
      for (const r of rows) existing.add(r.id);
    }
    const orphanKeys = ids.filter((id) => !existing.has(id)).flatMap((id) => byUser.get(id)!);
    return (await this.deleteKeys(orphanKeys, bucket)).deleted;
  }
}
