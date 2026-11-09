import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DataSource } from 'typeorm';
import { ProfileAgeService, todayInJakarta } from './profile-age.service';
import { CronLockService } from '../../common/scheduling/cron-lock.service';

describe('todayInJakarta', () => {
  it('berganti tanggal tepat pukul 00.00 WIB (17.00 UTC)', () => {
    expect(todayInJakarta(new Date('2026-11-09T16:59:59Z'))).toBe('2026-11-09');
    expect(todayInJakarta(new Date('2026-11-09T17:00:00Z'))).toBe('2026-11-10');
  });

  it('melintasi akhir tahun dengan benar', () => {
    expect(todayInJakarta(new Date('2026-12-31T17:30:00Z'))).toBe('2027-01-01');
  });
});

describe('ProfileAgeService', () => {
  let service: ProfileAgeService;
  let query: ReturnType<typeof vi.fn>;
  let acquire: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    query = vi.fn().mockResolvedValue([[], 3]);
    acquire = vi.fn().mockResolvedValue(true);
    service = new ProfileAgeService(
      { query } as unknown as DataSource,
      { acquire } as unknown as CronLockService,
    );
  });

  it('menghitung ulang umur dari tanggal lahir per tanggal yang diberikan', async () => {
    const updated = await service.refreshAges('2026-11-09');

    expect(updated).toBe(3);
    const [sql, params] = query.mock.calls[0];
    expect(params).toEqual(['2026-11-09']);
    expect(sql).toMatch(/UPDATE "user_profile"/);
    expect(sql).toMatch(/age\(\$1::date::timestamp, "date_of_birth"::timestamp\)/);
    // Profil tanpa tanggal lahir tak disentuh; baris yang sudah benar tak ditulis.
    expect(sql).toMatch(/"date_of_birth" IS NOT NULL/);
    expect(sql).toMatch(/"age" IS DISTINCT FROM/);
    // Tak bergantung pada CURRENT_DATE/now() sesi DB (UTC di VPS).
    expect(sql).not.toMatch(/CURRENT_DATE|now\(\)/i);
  });

  it('mengembalikan 0 bila driver tak melaporkan jumlah baris', async () => {
    query.mockResolvedValueOnce([]);
    expect(await service.refreshAges('2026-11-09')).toBe(0);
  });

  it('job harian memakai tanggal WIB hari ini dan kunci cron', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-09T17:00:05Z')); // 00.00.05 WIB 10 Nov
    try {
      await service.handleDailyRefresh();
    } finally {
      vi.useRealTimers();
    }

    expect(acquire).toHaveBeenCalledWith('profile-age-daily', expect.any(Number));
    expect(query.mock.calls[0][1]).toEqual(['2026-11-10']);
  });

  it('melewati job bila replika lain memegang kunci', async () => {
    acquire.mockResolvedValueOnce(false);
    await service.handleDailyRefresh();
    expect(query).not.toHaveBeenCalled();
  });

  it('kegagalan DB tidak melempar (boot & cron tetap aman)', async () => {
    query.mockRejectedValueOnce(new Error('db down'));
    await expect(service.handleDailyRefresh()).resolves.toBeUndefined();
  });

  it('saat boot memakai kunci terpisah dari job harian', async () => {
    service.onApplicationBootstrap();
    await vi.waitFor(() => expect(query).toHaveBeenCalled());
    expect(acquire).toHaveBeenCalledWith('profile-age-boot', expect.any(Number));
  });
});
