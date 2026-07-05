import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import { UserRole, PointCreditReason, SurveyStatus, QuestionType } from '@shared/enums';
import { User, UserStatus } from '@modules/auth/entities';
import {
  Survey,
  SurveyPage,
  SurveyRewardConfig,
  SurveyTimeConfig,
  Question,
} from '@modules/survey/entities';
import {
  PointTransaction,
  TransactionType,
} from '@modules/reward/entities/point-transaction.entity';
import {
  RewardRedemption,
  RedemptionStatus,
} from '@modules/reward/entities/reward-redemption.entity';
import { createTestApp, prepareSchema, api, waitFor, type TestApp } from './app-harness';

/**
 * Smoke test alur uang inti: LOGIN → ISI SURVEI (dapat poin) → REDEEM (tukar).
 * Menjalankan AppModule NYATA terhadap Postgres + Redis (docker-compose.test.yml).
 * Ini jaring pengaman untuk refactor SurveyFillPage/reward ke depan.
 */
describe('E2E smoke: login → isi survei → redeem', () => {
  let t: TestApp;
  let ds: DataSource;

  const stamp = Date.now();
  const email = `e2e.responden.${stamp}@example.com`;
  const password = 'Test1234!';
  const phone = `0819${String(stamp).slice(-8)}`;

  let respondentId: string;
  let surveyId: string;
  let questionId: string;
  let token: string;

  beforeAll(async () => {
    await prepareSchema(); // migrasi asli → skema lengkap
    t = await createTestApp();
    ds = t.dataSource;

    // 1) Responden aktif + saldo poin awal (100.000) via repository.
    const userRepo = ds.getRepository(User);
    const respondent = await userRepo.save(
      userRepo.create({
        email,
        phone,
        passwordHash: await bcrypt.hash(password, 10),
        fullName: 'E2E Responden',
        role: UserRole.RESPONDENT,
        status: UserStatus.ACTIVE,
        emailVerified: true,
        profileCompleted: true,
      }),
    );
    respondentId = respondent.id;

    const txRepo = ds.getRepository(PointTransaction);
    const expiresAt = new Date();
    expiresAt.setMonth(expiresAt.getMonth() + 12);
    await txRepo.save(
      txRepo.create({
        userId: respondentId,
        amount: 100_000,
        transactionType: TransactionType.CREDIT,
        reason: PointCreditReason.MANUAL_CREDIT,
        earnedAt: new Date(),
        expiresAt,
        expired: false,
      }),
    );

    // 2) Survei ACTIVE + 1 halaman + 1 pertanyaan short_text + reward auto 100 poin.
    const survey = await ds.getRepository(Survey).save(
      ds.getRepository(Survey).create({
        createdBy: respondentId,
        title: 'E2E Smoke Survey',
        status: SurveyStatus.ACTIVE,
        rewardMode: 'automatic',
      }),
    );
    surveyId = survey.id;
    const page = await ds
      .getRepository(SurveyPage)
      .save(ds.getRepository(SurveyPage).create({ surveyId, pageNumber: 1, orderIndex: 0 }));
    await ds
      .getRepository(SurveyRewardConfig)
      .save(
        ds
          .getRepository(SurveyRewardConfig)
          .create({ surveyId, rewardMode: 'automatic', pointsValue: 100 }),
      );
    // Wajib ada: submit memanggil getTimeConfig (404 bila baris ini absen).
    await ds
      .getRepository(SurveyTimeConfig)
      .save(ds.getRepository(SurveyTimeConfig).create({ surveyId }));
    const question = await ds.getRepository(Question).save(
      ds.getRepository(Question).create({
        surveyId,
        pageId: page.id,
        type: QuestionType.SHORT_TEXT,
        questionText: 'Nama panggilan Anda?',
        required: false,
        enabled: true,
        orderIndex: 0,
      }),
    );
    questionId = question.id;
  });

  afterAll(async () => {
    await t?.app.close();
  });

  it('login mengembalikan accessToken', async () => {
    const res = await api<{ accessToken?: string }>(t.baseUrl, 'POST', '/api/auth/login', {
      body: { email, password },
    });
    expect([200, 201]).toContain(res.status);
    expect(res.body.accessToken).toBeTruthy();
    token = res.body.accessToken!;
  });

  it('GET fill mengembalikan pertanyaan survei', async () => {
    const res = await api<{ questions?: { id: string }[] }>(
      t.baseUrl,
      'GET',
      `/api/surveys/${surveyId}/fill`,
      { token },
    );
    expect(res.status).toBe(200);
    expect(res.body.questions?.some((q) => q.id === questionId)).toBe(true);
  });

  it('submit respons → poin survei dikreditkan (saldo naik)', async () => {
    const res = await api(t.baseUrl, 'POST', `/api/surveys/${surveyId}/responses/submit`, {
      token,
      body: { answers: [{ questionId, value: 'Budi' }], deviceType: 'web' },
    });
    expect([200, 201]).toContain(res.status);

    // Kredit poin terjadi via event handler (async) → tunggu saldo naik dari 100.000.
    const txRepo = ds.getRepository(PointTransaction);
    const credited = await waitFor(async () => {
      const row = await txRepo.findOne({
        where: { userId: respondentId, reason: PointCreditReason.SURVEY_COMPLETION },
      });
      return !!row;
    });
    expect(credited).toBe(true);

    const balance = await api<{ total: number; available: number }>(
      t.baseUrl,
      'GET',
      '/api/rewards/balance',
      { token },
    );
    expect(balance.status).toBe(200);
    expect(balance.body.total).toBeGreaterThan(100_000);
  });

  it('redeem pulsa-5000 (500 poin) → OTP → confirm → status memproses & poin terdebit', async () => {
    const before = await api<{ available: number }>(t.baseUrl, 'GET', '/api/rewards/balance', {
      token,
    });

    const init = await api<{ redemptionId?: string; otpRequired?: boolean }>(
      t.baseUrl,
      'POST',
      '/api/rewards/redeem',
      { token, body: { rewardId: 'pulsa-5000', destinationNumber: '081234567890' } },
    );
    expect([200, 201]).toContain(init.status);
    const redemptionId = init.body.redemptionId!;
    expect(redemptionId).toBeTruthy();

    // Baca OTP langsung dari DB (email tak terkirim di test).
    const redemption = await ds
      .getRepository(RewardRedemption)
      .findOneOrFail({ where: { id: redemptionId } });
    expect(redemption.otpCode).toMatch(/^\d{6}$/);

    const confirm = await api(t.baseUrl, 'POST', `/api/rewards/redeem/${redemptionId}/confirm`, {
      token,
      body: { otpCode: redemption.otpCode },
    });
    expect([200, 201]).toContain(confirm.status);

    // Status berpindah dari PENDING (diproses/selesai) & poin terdebit 500.
    const after = await ds
      .getRepository(RewardRedemption)
      .findOneOrFail({ where: { id: redemptionId } });
    expect([RedemptionStatus.PROCESSING, RedemptionStatus.COMPLETED]).toContain(after.status);

    const bal = await api<{ available: number }>(t.baseUrl, 'GET', '/api/rewards/balance', {
      token,
    });
    expect(bal.body.available).toBe(before.body.available - 500);
  });
});
