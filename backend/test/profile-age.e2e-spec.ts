import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { DataSource } from 'typeorm';
import { UserRole } from '@shared/enums';
import { User, UserStatus } from '@modules/auth/entities';
import { UserProfile } from '@modules/registration/entities';
import { ProfileAgeService, todayInJakarta } from '@modules/registration/profile-age.service';
import { createTestApp, prepareSchema, type TestApp } from './app-harness';

/** Geser tanggal "YYYY-MM-DD" sejumlah tahun & hari (kalender UTC murni). */
function shift(date: string, years: number, days = 0): string {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y + years, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * Umur responden mengikuti tanggal lahir terhadap Postgres NYATA (SQL age()
 * tak bisa diuji lewat mock). Tanggal lahir dibuat relatif terhadap hari ini
 * WIB, sehingga hasilnya sama walau job saat-boot ikut berjalan bersamaan.
 */
describe('E2E: umur responden diperbarui dari tanggal lahir', () => {
  let t: TestApp;
  let ds: DataSource;
  const today = todayInJakarta();
  const stamp = Date.now();
  const ids: Record<string, string> = {};

  async function seed(key: string, dateOfBirth: string | null, age: number): Promise<void> {
    const userRepo = ds.getRepository(User);
    const user = await userRepo.save(
      userRepo.create({
        email: `e2e.umur.${key}.${stamp}@example.com`,
        phone: `0817${String(stamp).slice(-6)}${Object.keys(ids).length}`,
        passwordHash: 'x',
        fullName: `E2E Umur ${key}`,
        role: UserRole.RESPONDENT,
        status: UserStatus.ACTIVE,
        emailVerified: true,
        profileCompleted: true,
      }),
    );
    const profileRepo = ds.getRepository(UserProfile);
    await profileRepo.save(profileRepo.create({ userId: user.id, dateOfBirth, age }));
    ids[key] = user.id;
  }

  async function ageOf(key: string): Promise<number | null> {
    const p = await ds.getRepository(UserProfile).findOneByOrFail({ userId: ids[key] });
    return p.age;
  }

  beforeAll(async () => {
    await prepareSchema();
    t = await createTestApp();
    ds = t.dataSource;

    // Semua tersimpan dengan umur basi (umur waktu "daftar" 3 tahun lalu).
    await seed('ultah-hari-ini', shift(today, -30), 27);
    await seed('ultah-besok', shift(today, -30, 1), 27);
    await seed('ultah-kemarin', shift(today, -30, -1), 27);
    await seed('tanpa-tgl-lahir', null, 40);
  });

  afterAll(async () => {
    await t?.app.close();
  });

  it('menyamakan umur dengan tanggal lahir, termasuk yang berulang tahun hari ini', async () => {
    await t.app.get(ProfileAgeService).refreshAges(today);

    expect(await ageOf('ultah-hari-ini')).toBe(30);
    expect(await ageOf('ultah-besok')).toBe(29);
    expect(await ageOf('ultah-kemarin')).toBe(30);
    // Tanpa tanggal lahir: tak bisa dihitung, dibiarkan.
    expect(await ageOf('tanpa-tgl-lahir')).toBe(40);
  });

  it('naik satu tahun tepat saat hari ulang tahun tiba', async () => {
    const svc = t.app.get(ProfileAgeService);
    await svc.refreshAges(shift(today, 0, 1)); // besok
    expect(await ageOf('ultah-besok')).toBe(30);

    // Dijalankan ulang di tanggal yang sama: tidak ada yang berubah lagi.
    expect(await svc.refreshAges(shift(today, 0, 1))).toBe(0);
  });

  it('kelahiran 29 Februari naik umur pada 1 Maret di tahun non-kabisat', async () => {
    await ds
      .getRepository(UserProfile)
      .update({ userId: ids['tanpa-tgl-lahir'] }, { dateOfBirth: '2004-02-29' });
    const svc = t.app.get(ProfileAgeService);

    await svc.refreshAges('2025-02-28');
    expect(await ageOf('tanpa-tgl-lahir')).toBe(20);
    await svc.refreshAges('2025-03-01');
    expect(await ageOf('tanpa-tgl-lahir')).toBe(21);
  });
});
