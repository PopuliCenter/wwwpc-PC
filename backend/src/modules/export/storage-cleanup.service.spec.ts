import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { StorageCleanupService } from './storage-cleanup.service';

const U1 = '0b6f2c1e-1a2b-4c3d-8e9f-000000000001';
const U2 = '0b6f2c1e-1a2b-4c3d-8e9f-000000000002';
const DAY = 24 * 60 * 60 * 1000;

describe('StorageCleanupService', () => {
  let s3: any;
  let dataSource: any;
  let cronLock: any;
  let service: StorageCleanupService;
  /** Isi bucket palsu: bucket → daftar objek. */
  let objects: Record<string, Array<{ key: string; lastModified: string | null }>>;

  beforeEach(() => {
    objects = { uploads: [], exports: [] };
    s3 = {
      uploadsBucket: 'uploads',
      exportsBucket: 'exports',
      deleteObject: vi.fn(async (key: string, bucket: string) => {
        objects[bucket] = objects[bucket].filter((o) => o.key !== key);
      }),
      listObjects: vi.fn(async (bucket: string, prefix: string) => ({
        objects: objects[bucket]
          .filter((o) => o.key.startsWith(prefix))
          .map((o) => ({ ...o, size: 1 })),
        nextToken: undefined,
      })),
    };
    dataSource = { query: vi.fn().mockResolvedValue([]) };
    cronLock = { acquire: vi.fn().mockResolvedValue(true) };
    service = new StorageCleanupService(s3, dataSource, cronLock);
  });

  afterEach(() => {
    delete process.env.EXPORT_RETENTION_DAYS;
    delete process.env.DELETION_BACKUP_RETENTION_DAYS;
  });

  describe('planForUser + executeUserPlan (T-16)', () => {
    it('collects upload prefixes, referenced files, avatar and exports of the user', async () => {
      const runner = {
        query: vi.fn(async (sql: string) => {
          if (sql.includes('SELECT DISTINCT survey_id')) return [{ survey_id: 's1' }];
          if (sql.includes('FROM answer')) return [{ key: `survey-uploads/s1/${U1}/ttd.png` }];
          if (sql.includes('FROM export_job')) return [{ file_path: 'exports/export-j1.csv' }];
          return [];
        }),
      };

      const plan = await service.planForUser(runner, U1);

      expect(plan).toEqual({
        userId: U1,
        uploadPrefixes: [`survey-uploads/s1/${U1}/`],
        uploadKeys: [`avatars/${U1}`, `survey-uploads/s1/${U1}/ttd.png`],
        exportKeys: ['exports/export-j1.csv'],
      });
    });

    it('deletes everything under the prefixes plus single keys, never throws', async () => {
      objects.uploads = [
        { key: `survey-uploads/s1/${U1}/a.jpg`, lastModified: null },
        { key: `survey-uploads/s1/${U1}/b.m4a`, lastModified: null },
        { key: `survey-uploads/s1/${U2}/keep.jpg`, lastModified: null },
        { key: `avatars/${U1}`, lastModified: null },
      ];
      objects.exports = [{ key: 'exports/export-j1.csv', lastModified: null }];

      const out = await service.executeUserPlan({
        userId: U1,
        uploadPrefixes: [`survey-uploads/s1/${U1}/`],
        uploadKeys: [`avatars/${U1}`],
        exportKeys: ['exports/export-j1.csv'],
      });

      expect(out.failed).toBe(0);
      expect(objects.uploads.map((o) => o.key)).toEqual([`survey-uploads/s1/${U2}/keep.jpg`]);
      expect(objects.exports).toEqual([]);
    });

    it('reports failures instead of throwing when MinIO is down', async () => {
      s3.deleteObject.mockRejectedValue(new Error('MinIO down'));
      const out = await service.executeUserPlan({
        userId: U1,
        uploadPrefixes: [],
        uploadKeys: [`avatars/${U1}`],
        exportKeys: [],
      });
      expect(out).toEqual({ deleted: 0, failed: 1 });
    });
  });

  it('uploadKeysForResponse only returns survey-uploads keys of that response (T-31)', async () => {
    const runner = { query: vi.fn().mockResolvedValue([{ key: 'survey-uploads/s/u/x.jpg' }]) };
    const keys = await service.uploadKeysForResponse(runner, 'resp-1');
    expect(keys).toEqual(['survey-uploads/s/u/x.jpg']);
    const [sql, params] = runner.query.mock.calls[0];
    expect(sql).toContain("LIKE 'survey-uploads/%'");
    expect(params).toEqual(['resp-1']);
  });

  describe('sweep (T-31 retensi + objek yatim)', () => {
    const now = new Date('2026-11-23T03:45:00Z');
    const ago = (days: number) => new Date(now.getTime() - days * DAY).toISOString();

    it('expires old exports/backups, clears file_path, and removes files of deleted users', async () => {
      objects.exports = [
        { key: 'exports/export-old.csv', lastModified: ago(8) },
        { key: 'exports/export-new.csv', lastModified: ago(1) },
        { key: 'backups/deletion-old.json', lastModified: ago(31) },
        { key: 'backups/deletion-new.json', lastModified: ago(5) },
      ];
      objects.uploads = [
        { key: `survey-uploads/s1/${U1}/a.jpg`, lastModified: ago(2) }, // U1 masih ada
        { key: `survey-uploads/s1/${U2}/b.jpg`, lastModified: ago(2) }, // U2 sudah dihapus
        { key: `avatars/${U2}`, lastModified: ago(2) },
        { key: 'survey-uploads/s1/bukan-uuid/c.jpg', lastModified: ago(2) }, // tak dikenal → biarkan
      ];
      dataSource.query.mockImplementation(async (sql: string) =>
        sql.includes('FROM users') ? [{ id: U1 }] : [],
      );

      const res = await service.sweep(now);

      expect(res).toEqual({ exports: 1, backups: 1, orphans: 2 });
      expect(objects.exports.map((o) => o.key)).toEqual([
        'exports/export-new.csv',
        'backups/deletion-new.json',
      ]);
      expect(objects.uploads.map((o) => o.key)).toEqual([
        `survey-uploads/s1/${U1}/a.jpg`,
        'survey-uploads/s1/bukan-uuid/c.jpg',
      ]);
      const update = dataSource.query.mock.calls.find((c: any[]) =>
        String(c[0]).includes('UPDATE export_job'),
      );
      expect(update[1][0]).toEqual(new Date(now.getTime() - 7 * DAY));
    });

    it('respects EXPORT_RETENTION_DAYS / DELETION_BACKUP_RETENTION_DAYS', async () => {
      process.env.EXPORT_RETENTION_DAYS = '30';
      process.env.DELETION_BACKUP_RETENTION_DAYS = '90';
      objects.exports = [
        { key: 'exports/export-old.csv', lastModified: ago(8) },
        { key: 'backups/deletion-old.json', lastModified: ago(31) },
      ];
      const res = await service.sweep(now);
      expect(res.exports + res.backups).toBe(0);
    });

    it('does not touch very recent uploads of unknown users (race guard)', async () => {
      objects.uploads = [{ key: `survey-uploads/s1/${U2}/b.jpg`, lastModified: now.toISOString() }];
      const res = await service.sweep(now);
      expect(res.orphans).toBe(0);
      expect(objects.uploads).toHaveLength(1);
    });

    it('scheduledSweep runs only on the replica holding the cron lock', async () => {
      cronLock.acquire.mockResolvedValue(false);
      await service.scheduledSweep();
      expect(s3.listObjects).not.toHaveBeenCalled();
    });
  });
});
