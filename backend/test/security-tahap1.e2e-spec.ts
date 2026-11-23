import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import { UserRole, PointCreditReason, SurveyStatus } from '@shared/enums';
import { User, UserStatus } from '@modules/auth/entities';
import { UserProfile } from '@modules/registration/entities/user-profile.entity';
import { Survey, SurveyPage, SurveyTimeConfig } from '@modules/survey/entities';
import {
  PointTransaction,
  TransactionType,
} from '@modules/reward/entities/point-transaction.entity';
import { NotificationService } from '@modules/notification/notification.service';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { createTestApp, prepareSchema, api, type TestApp } from './app-harness';

/**
 * Regresi audit keamanan 23 Nov 2026, Tahap 1 — dijalankan terhadap AppModule
 * NYATA (Postgres + Redis). Mereproduksi bukti dinamis laporan audit dan
 * memastikan semuanya kini tertolak.
 */
describe('E2E keamanan Tahap 1 (audit 23 Nov 2026)', () => {
  let t: TestApp;
  let ds: DataSource;
  const stamp = Date.now();
  const password = 'Rahasia12345';
  let seq = 0;

  async function makeUser(role: UserRole, extra: Partial<User> = {}): Promise<User> {
    seq += 1;
    const repo = ds.getRepository(User);
    return repo.save(
      repo.create({
        email: `sec.${role}.${stamp}.${seq}@example.com`,
        phone: `0817${String(stamp + seq).slice(-8)}`,
        passwordHash: await bcrypt.hash(password, 10),
        fullName: `Sec ${role} ${seq}`,
        role,
        status: UserStatus.ACTIVE,
        emailVerified: true,
        profileCompleted: true,
        ...extra,
      }),
    );
  }

  async function login(email: string): Promise<string> {
    const res = await api<{ accessToken: string }>(t.baseUrl, 'POST', '/api/auth/login', {
      body: { email, password },
    });
    expect([200, 201]).toContain(res.status);
    return res.body.accessToken;
  }

  let superAdmin: User;
  let admin: User;
  let superToken: string;
  let adminToken: string;

  const prevThrottle = process.env.DISABLE_THROTTLE;

  beforeAll(async () => {
    // Banyak login dari satu IP dalam satu menit → matikan rate-limit khusus
    // spesifikasi ini (dibaca per request oleh EnvThrottlerGuard).
    process.env.DISABLE_THROTTLE = 'true';
    await prepareSchema();
    t = await createTestApp();
    ds = t.dataSource;
    superAdmin = await makeUser(UserRole.SUPER_ADMIN);
    admin = await makeUser(UserRole.ADMIN);
    superToken = await login(superAdmin.email);
    adminToken = await login(admin.email);
  });

  afterAll(async () => {
    if (prevThrottle === undefined) delete process.env.DISABLE_THROTTLE;
    else process.env.DISABLE_THROTTLE = prevThrottle;
    await t?.app.close();
  });

  it('T-02/T-11: deactivate langsung memutus token lama; OTP tak bisa mengaktifkan ulang', async () => {
    const victim = await makeUser(UserRole.ADMIN);
    const oldToken = await login(victim.email);
    expect((await api(t.baseUrl, 'GET', '/api/auth/profile', { token: oldToken })).status).toBe(
      200,
    );

    const deact = await api(t.baseUrl, 'PATCH', `/api/users/${victim.id}/deactivate`, {
      token: superToken,
    });
    expect(deact.status).toBe(204);

    // Token lama mati seketika.
    expect((await api(t.baseUrl, 'GET', '/api/auth/profile', { token: oldToken })).status).toBe(
      401,
    );
    // complete-profile dgn token lama juga tertolak (tak bisa menulis status).
    const cp = await api(t.baseUrl, 'POST', '/api/registration/complete-profile', {
      token: oldToken,
      body: {},
    });
    expect(cp.status).toBe(401);

    // resend-otp → respons generik, tanpa email.
    const sendOtp = vi.spyOn(t.app.get(NotificationService), 'sendOtpEmail');
    const resend = await api<{ message: string }>(
      t.baseUrl,
      'POST',
      '/api/registration/resend-otp',
      {
        body: { email: victim.email },
      },
    );
    expect(resend.status).toBe(200);
    expect(sendOtp).not.toHaveBeenCalled();
    sendOtp.mockRestore();

    // Seandainya ada OTP tersisa di Redis untuk email ini, verify tetap ditolak.
    const cache = t.app.get<Cache>(CACHE_MANAGER, { strict: false });
    await cache.set(
      `otp:${victim.email}`,
      JSON.stringify({ code: '123456', attemptCount: 0, resendCount: 0, createdAt: new Date() }),
      60_000,
    );
    const verify = await api<{ accessToken?: string }>(
      t.baseUrl,
      'POST',
      '/api/registration/verify-otp',
      {
        body: { email: victim.email, code: '123456' },
      },
    );
    expect(verify.status).toBe(400);
    expect(verify.body.accessToken).toBeUndefined();

    const row = await ds.getRepository(User).findOneByOrFail({ id: victim.id });
    expect(row.status).toBe(UserStatus.INACTIVE);
  });

  it('T-29: resend-otp untuk email tak terdaftar → 200 generik (bukan "User not found")', async () => {
    const res = await api<{ message: string }>(t.baseUrl, 'POST', '/api/registration/resend-otp', {
      body: { email: `tidak.ada.${stamp}@example.com` },
    });
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toMatch(/not found/i);
  });

  it('T-03: ADMIN tidak bisa mengimpor akun super_admin/admin; hanya responden', async () => {
    const csv = [
      `Eskalasi,esk.sa.${stamp}@example.com,0816${String(stamp).slice(-8)},super_admin`,
      `Eskalasi2,esk.ad.${stamp}@example.com,0815${String(stamp).slice(-8)},admin`,
      `Responden,imp.r.${stamp}@example.com,0814${String(stamp).slice(-8)},respondent`,
    ].join('\n');
    const res = await api<{ successCount: number; failedCount: number }>(
      t.baseUrl,
      'POST',
      '/api/users/bulk-import',
      { token: adminToken, body: { csv } },
    );
    expect(res.status).toBe(201);
    expect(res.body.successCount).toBe(1);
    expect(res.body.failedCount).toBe(2);
    const escalated = await ds
      .getRepository(User)
      .findOneBy({ email: `esk.sa.${stamp}@example.com` });
    expect(escalated).toBeNull();
  });

  it('T-12: GET /users tidak memuat passwordHash', async () => {
    const res = await api<{ data: Record<string, unknown>[] }>(t.baseUrl, 'GET', '/api/users', {
      token: superToken,
    });
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|\$2[aby]\$/);
  });

  it('T-11: ganti peran & reset sandi admin mencabut sesi target', async () => {
    const target = await makeUser(UserRole.ANALYST);
    let tok = await login(target.email);
    const role = await api(t.baseUrl, 'PATCH', `/api/users/${target.id}/role`, {
      token: superToken,
      body: { role: UserRole.VIEWER },
    });
    expect(role.status).toBe(204);
    expect((await api(t.baseUrl, 'GET', '/api/auth/profile', { token: tok })).status).toBe(401);

    tok = await login(target.email);
    const reset = await api(t.baseUrl, 'POST', `/api/users/${target.id}/reset-password`, {
      token: superToken,
    });
    expect([200, 201]).toContain(reset.status);
    expect((await api(t.baseUrl, 'GET', '/api/auth/profile', { token: tok })).status).toBe(401);
  });

  it('T-09/T-10/T-13/T-14: alur responden', async () => {
    const r = await makeUser(UserRole.RESPONDENT);
    await ds.getRepository(UserProfile).save(
      ds.getRepository(UserProfile).create({
        userId: r.id,
        age: 30,
        gender: 'male' as never,
        occupation: 'Petani',
        city: 'Bandung',
        province: 'Jawa Barat',
      }),
    );
    const token = await login(r.email);

    // T-09: responden tak boleh mengganti email.
    const email = await api(t.baseUrl, 'PATCH', '/api/auth/profile', {
      token,
      body: { email: `korban.${stamp}@example.com` },
    });
    expect(email.status).toBe(400);

    // T-10: complete-profile ulang ditolak (demografi terkunci).
    const cp = await api(t.baseUrl, 'POST', '/api/registration/complete-profile', {
      token,
      body: {
        dateOfBirth: '1960-05-05',
        gender: 'female',
        occupation: 'Pensiunan',
        education: 'SMA/SMK',
        religion: 'Islam',
        city: 'Jayapura',
        province: 'Papua',
        district: 'Abepura',
        address: 'Jl. Contoh 1',
      },
    });
    expect(cp.status).toBe(409);
    const prof = await ds.getRepository(UserProfile).findOneByOrFail({ userId: r.id });
    expect(prof.province).toBe('Jawa Barat');

    // T-14: survei INACTIVE & DRAFT menolak pengisian.
    for (const status of [SurveyStatus.INACTIVE, SurveyStatus.DRAFT]) {
      const survey = await ds.getRepository(Survey).save(
        ds.getRepository(Survey).create({
          title: `Survei ${status} ${stamp}`,
          status,
          createdBy: superAdmin.id,
        } as Partial<Survey>),
      );
      await ds
        .getRepository(SurveyPage)
        .save(
          ds
            .getRepository(SurveyPage)
            .create({ surveyId: survey.id, pageNumber: 1, orderIndex: 0 }),
        );
      await ds
        .getRepository(SurveyTimeConfig)
        .save(ds.getRepository(SurveyTimeConfig).create({ surveyId: survey.id }));

      const fill = await api(t.baseUrl, 'GET', `/api/surveys/${survey.id}/fill`, { token });
      expect(fill.status).toBe(403);
      const submit = await api(t.baseUrl, 'POST', `/api/surveys/${survey.id}/responses/submit`, {
        token,
        body: { answers: [], deviceType: 'web' },
      });
      expect(submit.status).toBe(403);
      const rq = await api(t.baseUrl, 'GET', `/api/surveys/${survey.id}/questions/randomized`, {
        token,
      });
      expect(rq.status).toBe(403);
    }

    // T-13: riwayat penukaran tak memuat OTP.
    const txRepo = ds.getRepository(PointTransaction);
    await txRepo.save(
      txRepo.create({
        userId: r.id,
        amount: 5_000,
        transactionType: TransactionType.CREDIT,
        reason: PointCreditReason.MANUAL_CREDIT,
        earnedAt: new Date(),
        expiresAt: null,
        expired: false,
      }),
    );
    const init = await api<{ redemptionId: string }>(t.baseUrl, 'POST', '/api/rewards/redeem', {
      token,
      body: { rewardId: 'pulsa-5000', destinationNumber: '081234567890' },
    });
    expect([200, 201]).toContain(init.status);
    const hist = await api<{ data: Record<string, unknown>[] }>(
      t.baseUrl,
      'GET',
      '/api/rewards/redemptions',
      { token },
    );
    expect(hist.status).toBe(200);
    expect(hist.body.data.length).toBeGreaterThan(0);
    for (const row of hist.body.data) {
      expect(row).not.toHaveProperty('otpCode');
      expect(row).not.toHaveProperty('otpExpiresAt');
      expect(row).not.toHaveProperty('otpAttempts');
    }
  });

  it('T-17: dua penukaran paralel melebihi saldo → hanya satu yang lolos', async () => {
    const r = await makeUser(UserRole.RESPONDENT);
    const token = await login(r.email);
    const txRepo = ds.getRepository(PointTransaction);
    await txRepo.save(
      txRepo.create({
        userId: r.id,
        amount: 500, // cukup untuk SATU pulsa-5000
        transactionType: TransactionType.CREDIT,
        reason: PointCreditReason.MANUAL_CREDIT,
        earnedAt: new Date(),
        expiresAt: null,
        expired: false,
      }),
    );
    const body = { rewardId: 'pulsa-5000', destinationNumber: '081234567890' };
    const results = await Promise.all(
      Array.from({ length: 4 }, () =>
        api(t.baseUrl, 'POST', '/api/rewards/redeem', { token, body }),
      ),
    );
    const ok = results.filter((x) => x.status === 200 || x.status === 201);
    expect(ok).toHaveLength(1);
  });
});
