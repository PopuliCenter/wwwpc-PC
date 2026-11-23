import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import { UserRole } from '@shared/enums';
import { User, UserStatus } from '@modules/auth/entities';
import { DeviceToken } from '@modules/notification/entities/device-token.entity';
import { MAX_TOKENS_PER_USER } from '@modules/notification/device-token.service';
import { RedisThrottlerStorage } from '../src/common/security/redis-throttler.storage';
import { createTestApp, prepareSchema, api, type TestApp } from './app-harness';

/**
 * Regresi audit keamanan 23 Nov 2026, Tahap 3–4, terhadap AppModule NYATA
 * (Postgres + Redis). MinIO tidak tersedia di E2E: penghapusan berkas bersifat
 * best-effort, jadi jalur DB tetap harus sukses walau storage mati.
 */
describe('E2E keamanan Tahap 3–4 (audit 23 Nov 2026)', () => {
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
        email: `t34.${role}.${stamp}.${seq}@example.com`,
        phone: `0818${String(stamp + seq).slice(-8)}`,
        passwordHash: await bcrypt.hash(password, 10),
        fullName: `T34 ${role} ${seq}`,
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

  const prevThrottle = process.env.DISABLE_THROTTLE;

  beforeAll(async () => {
    process.env.DISABLE_THROTTLE = 'true';
    await prepareSchema();
    t = await createTestApp();
    ds = t.dataSource;
  });

  afterAll(async () => {
    if (prevThrottle === undefined) delete process.env.DISABLE_THROTTLE;
    else process.env.DISABLE_THROTTLE = prevThrottle;
    await t?.app.close();
  });

  it('T-07: counter rate-limit di Redis berlaku lintas instance (multi-replika)', async () => {
    const opts = {
      host: process.env.REDIS_HOST,
      port: Number(process.env.REDIS_PORT),
      db: Number(process.env.REDIS_DB ?? 0),
      keyPrefix: `e2e-${stamp}:`,
    };
    // Dua "replika" = dua klien Redis terpisah, satu counter bersama.
    const a = RedisThrottlerStorage.fromOptions(opts);
    const b = RedisThrottlerStorage.fromOptions(opts);
    await new Promise((r) => setTimeout(r, 200)); // tunggu koneksi lazy
    try {
      const r1 = await a.increment('ip-x', 60_000, 2, 60_000, 'login');
      const r2 = await b.increment('ip-x', 60_000, 2, 60_000, 'login');
      const r3 = await a.increment('ip-x', 60_000, 2, 60_000, 'login');
      expect([r1.totalHits, r2.totalHits]).toEqual([1, 2]);
      expect(r1.isBlocked || r2.isBlocked).toBe(false);
      expect(r3.isBlocked).toBe(true);
      expect(r3.timeToBlockExpire).toBeGreaterThan(55);
      // Masih terblokir dari replika lain.
      expect((await b.increment('ip-x', 60_000, 2, 60_000, 'login')).isBlocked).toBe(true);
      // Kunci lain (IP lain / throttler lain) tidak ikut terblokir.
      expect((await b.increment('ip-y', 60_000, 2, 60_000, 'login')).isBlocked).toBe(false);
      expect((await b.increment('ip-x', 60_000, 2, 60_000, 'default')).isBlocked).toBe(false);
    } finally {
      await a.onModuleDestroy();
      await b.onModuleDestroy();
    }
  });

  it('DELETE /notifications/device-token: hanya token milik sendiri, idempoten; maks 10 token/user', async () => {
    const owner = await makeUser(UserRole.RESPONDENT);
    const other = await makeUser(UserRole.RESPONDENT);
    const ownerToken = await login(owner.email);
    const otherToken = await login(other.email);
    const fcm = `fcm-${stamp}-owner`;
    const repo = ds.getRepository(DeviceToken);

    const reg = await api(t.baseUrl, 'POST', '/api/notifications/device-token', {
      token: ownerToken,
      body: { token: fcm, platform: 'android' },
    });
    expect(reg.status).toBe(200);

    // Akun lain mencoba melepas token itu → 204 generik, baris TETAP ada.
    const foreign = await api(t.baseUrl, 'DELETE', '/api/notifications/device-token', {
      token: otherToken,
      body: { token: fcm },
    });
    expect(foreign.status).toBe(204);
    expect(await repo.countBy({ token: fcm })).toBe(1);

    // Pemilik melepas → terhapus; ulangi → tetap 204.
    for (let i = 0; i < 2; i++) {
      const del = await api(t.baseUrl, 'DELETE', '/api/notifications/device-token', {
        token: ownerToken,
        body: { token: fcm },
      });
      expect(del.status).toBe(204);
    }
    expect(await repo.countBy({ token: fcm })).toBe(0);

    // Tanpa login → 401.
    const anon = await api(t.baseUrl, 'DELETE', '/api/notifications/device-token', {
      body: { token: fcm },
    });
    expect(anon.status).toBe(401);

    // Batas token per user: yang tersisa = MAX_TOKENS_PER_USER terbaru.
    for (let i = 0; i < MAX_TOKENS_PER_USER + 3; i++) {
      await api(t.baseUrl, 'POST', '/api/notifications/device-token', {
        token: ownerToken,
        body: { token: `fcm-${stamp}-cap-${i}`, platform: 'android' },
      });
    }
    const left = await repo.find({ where: { userId: owner.id } });
    expect(left).toHaveLength(MAX_TOKENS_PER_USER);
    expect(left.map((r) => r.token)).toContain(`fcm-${stamp}-cap-${MAX_TOKENS_PER_USER + 2}`);
    expect(left.map((r) => r.token)).not.toContain(`fcm-${stamp}-cap-0`);
  });

  it('T-16/T-40: hapus akun → avatar 404, client_log ikut terhapus; id non-UUID ditolak', async () => {
    const user = await makeUser(UserRole.RESPONDENT);
    await ds.getRepository(User).update(user.id, { avatarUrl: `/avatar/${user.id}?t=1` });
    await ds.query(
      `INSERT INTO client_log (level, message, user_id, user_email) VALUES ('error', 'x', $1, $2)`,
      [user.id, user.email],
    );
    const token = await login(user.email);

    const del = await api(t.baseUrl, 'DELETE', '/api/users/me', { token });
    expect(del.status).toBe(204);

    expect((await api(t.baseUrl, 'GET', `/api/avatar/${user.id}`)).status).toBe(404);
    expect((await api(t.baseUrl, 'GET', '/api/avatar/..%2Fsurvey-uploads%2Fx')).status).toBe(404);
    const [{ n }] = await ds.query(
      'SELECT COUNT(*)::int AS n FROM client_log WHERE user_id = $1 OR user_email = $2',
      [user.id, user.email],
    );
    expect(n).toBe(0);
  });

  it('T-32: penghapusan GDPR sukses untuk subjek kedua dst, wajib konfirmasi email', async () => {
    const sa = await makeUser(UserRole.SUPER_ADMIN);
    const saToken = await login(sa.email);
    const subjects = [await makeUser(UserRole.RESPONDENT), await makeUser(UserRole.RESPONDENT)];

    // Konfirmasi salah / bentuk lama (UUID super admin) → 400, data utuh.
    const wrong = await api(t.baseUrl, 'POST', `/api/data-cleanup/gdpr/${subjects[0].id}`, {
      token: saToken,
      body: { confirmEmail: 'orang-lain@example.com' },
    });
    expect(wrong.status).toBe(400);
    const legacy = await api(t.baseUrl, 'POST', `/api/data-cleanup/gdpr/${subjects[0].id}`, {
      token: saToken,
      body: { superAdminApproval: sa.id },
    });
    expect(legacy.status).toBe(400);
    expect(await ds.getRepository(User).countBy({ id: subjects[0].id })).toBe(1);

    for (const s of subjects) {
      const res = await api(t.baseUrl, 'POST', `/api/data-cleanup/gdpr/${s.id}`, {
        token: saToken,
        body: { confirmEmail: s.email.toUpperCase() },
      });
      expect(res.status).toBe(204);
      expect(await ds.getRepository(User).countBy({ id: s.id })).toBe(0);
    }
  });

  it('T-33/T-45: VIEWER mendapat peta kasar tanpa nama; responden ditolak dari heatmap geolokasi', async () => {
    const viewer = await makeUser(UserRole.VIEWER);
    const resp = await makeUser(UserRole.RESPONDENT);
    const viewerToken = await login(viewer.email);
    const respToken = await login(resp.email);

    const map = await api<Array<Record<string, unknown>>>(
      t.baseUrl,
      'GET',
      '/api/dashboard/heatmap',
      {
        token: viewerToken,
      },
    );
    expect(map.status).toBe(200);
    for (const p of map.body) {
      expect(p).not.toHaveProperty('respondents');
      expect(Number(p.latitude) * 100).toBeCloseTo(Math.round(Number(p.latitude) * 100), 6);
    }

    const geo = await api(t.baseUrl, 'GET', '/api/geolocation/heatmap', { token: respToken });
    expect(geo.status).toBe(403);
  });
});
