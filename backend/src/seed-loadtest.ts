/**
 * Seed AKUN UJI BEBAN (load test). Membuat N responden aktif + terverifikasi +
 * profil lengkap dengan email/telepon/PASSWORD yang bisa ditebak k6, sehingga
 * ribuan virtual-user bisa login TANPA OTP.
 *
 * Pola akun (dipakai skrip k6):
 *   email    : loadtest+000001@loadtest.local ... +NNNNNN
 *   password : LoadTest12345  (sama untuk semua)
 *   phone    : 0819 + index 8 digit (unik)
 *
 * Idempoten & bulk: akun yang sudah ada dilewati. Jalankan di dalam container:
 *   docker compose exec backend node dist/seed-loadtest.js
 * Atur via env:
 *   LOADTEST_USERS (default 2000)   — jumlah akun
 *   LOADTEST_POINTS (default 0)     — saldo poin per akun (untuk uji tukar reward)
 *
 * Bersihkan lagi dengan cleanup-loadtest.ts.
 */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import { User, UserStatus } from './modules/auth/entities';
import { UserRole, PointCreditReason, SurveyStatus, QuestionType } from './shared/enums';
import {
  PointTransaction,
  TransactionType,
} from './modules/reward/entities/point-transaction.entity';
import { Survey } from './modules/survey/entities/survey.entity';
import { SurveyPage } from './modules/survey/entities/survey-page.entity';
import { Question } from './modules/survey/entities/question.entity';
import { SurveyTimeConfig } from './modules/survey/entities/survey-time-config.entity';

const LOADTEST_SURVEY_TITLE = 'LOADTEST — Survei Uji Beban';

/** Buat (atau pakai ulang) survei uji sederhana AKTIF tanpa targeting/batas. */
async function ensureLoadtestSurvey(ds: DataSource, createdBy: string): Promise<string> {
  const surveyRepo = ds.getRepository(Survey);
  const existing = await surveyRepo.findOne({ where: { title: LOADTEST_SURVEY_TITLE } });
  if (existing) return existing.id;

  const survey = await surveyRepo.save(
    surveyRepo.create({
      createdBy,
      title: LOADTEST_SURVEY_TITLE,
      description: 'Survei otomatis untuk load test (aman dihapus).',
      status: SurveyStatus.ACTIVE,
    }),
  );
  const page = await ds.getRepository(SurveyPage).save(
    ds.getRepository(SurveyPage).create({
      surveyId: survey.id,
      pageNumber: 1,
      orderIndex: 0,
      title: null,
    }),
  );
  const qRepo = ds.getRepository(Question);
  await qRepo.save([
    qRepo.create({
      surveyId: survey.id,
      pageId: page.id,
      type: QuestionType.SHORT_TEXT,
      questionText: 'Nama panggilan Anda?',
      required: true,
      orderIndex: 0,
    }),
    qRepo.create({
      surveyId: survey.id,
      pageId: page.id,
      type: QuestionType.NUMERIC_SCALE,
      questionText: 'Skala kepuasan 1-10?',
      required: true,
      orderIndex: 1,
      validationRules: { scaleMin: 1, scaleMax: 10 },
    }),
  ]);
  // Time config wajib ada agar submit tak 404 pada jalur lama (kini toleran, tapi
  // buat eksplisit): tanpa batas waktu / kuota.
  await ds.getRepository(SurveyTimeConfig).save(
    ds.getRepository(SurveyTimeConfig).create({
      surveyId: survey.id,
      startDatetime: null,
      endDatetime: null,
      maxDurationMinutes: null,
      maxRespondents: null,
      currentRespondentCount: 0,
    }),
  );
  return survey.id;
}

dotenv.config();

export const LOADTEST_EMAIL_PREFIX = 'loadtest+';
export const LOADTEST_EMAIL_DOMAIN = '@loadtest.local';
export const LOADTEST_PASSWORD = 'LoadTest12345';

function emailFor(i: number): string {
  return `${LOADTEST_EMAIL_PREFIX}${String(i).padStart(6, '0')}${LOADTEST_EMAIL_DOMAIN}`;
}
function phoneFor(i: number): string {
  return `0819${String(i).padStart(8, '0')}`; // 12 digit, cocok ^08\d{8,11}$
}

async function main(): Promise<void> {
  const total = parseInt(process.env.LOADTEST_USERS || '2000', 10);
  const points = parseInt(process.env.LOADTEST_POINTS || '0', 10);

  const ds = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_DATABASE || 'survei_online',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    entities: [__dirname + '/**/*.entity.{ts,js}'],
    synchronize: false,
  });

  await ds.initialize();
  const userRepo = ds.getRepository(User);
  const txRepo = ds.getRepository(PointTransaction);

  // Hash password SEKALI (bcrypt mahal; sama untuk semua akun uji).
  const passwordHash = await bcrypt.hash(LOADTEST_PASSWORD, 10);

  // Akun yang sudah ada (agar idempoten & cepat) — satu query.
  const existing = await userRepo
    .createQueryBuilder('u')
    .select('u.email', 'email')
    .where('u.email LIKE :p', { p: `${LOADTEST_EMAIL_PREFIX}%${LOADTEST_EMAIL_DOMAIN}` })
    .getRawMany<{ email: string }>();
  const have = new Set(existing.map((r) => r.email));

  const toCreate: User[] = [];
  for (let i = 1; i <= total; i++) {
    const email = emailFor(i);
    if (have.has(email)) continue;
    toCreate.push(
      userRepo.create({
        email,
        phone: phoneFor(i),
        passwordHash,
        fullName: `Load Test ${i}`,
        role: UserRole.RESPONDENT,
        status: UserStatus.ACTIVE,
        emailVerified: true,
        profileCompleted: true,
      }),
    );
  }

  // Bulk insert per 500 baris.
  let created = 0;
  for (let i = 0; i < toCreate.length; i += 500) {
    const chunk = toCreate.slice(i, i + 500);
    await userRepo.save(chunk);
    created += chunk.length;
    process.stdout.write(`\r  Membuat akun... ${created}/${toCreate.length}`);
  }
  process.stdout.write('\n');

  // Saldo poin opsional (untuk uji tukar reward) — hanya bila diminta.
  if (points > 0) {
    const all = await userRepo
      .createQueryBuilder('u')
      .select(['u.id AS id'])
      .where('u.email LIKE :p', { p: `${LOADTEST_EMAIL_PREFIX}%${LOADTEST_EMAIL_DOMAIN}` })
      .getRawMany<{ id: string }>();
    const earnedAt = new Date();
    const expiresAt = new Date(earnedAt);
    expiresAt.setMonth(expiresAt.getMonth() + 12);
    const rows = all.map((u) =>
      txRepo.create({
        userId: u.id,
        amount: points,
        transactionType: TransactionType.CREDIT,
        reason: PointCreditReason.MANUAL_CREDIT,
        referenceId: null,
        earnedAt,
        expiresAt,
        expired: false,
      }),
    );
    for (let i = 0; i < rows.length; i += 500) {
      await txRepo.save(rows.slice(i, i + 500));
    }
    console.log(`✓ ${points} poin dikreditkan ke ${rows.length} akun.`);
  }

  // Survei uji (created_by = akun #1).
  const first = await userRepo.findOne({ where: { email: emailFor(1) } });
  const surveyId = first ? await ensureLoadtestSurvey(ds, first.id) : null;

  console.log('\n──────── Akun uji beban siap ────────');
  console.log(`  Jumlah    : ${total} (baru dibuat: ${created})`);
  console.log(`  Email     : ${emailFor(1)} .. ${emailFor(total)}`);
  console.log(`  Password  : ${LOADTEST_PASSWORD}`);
  console.log(`  SURVEY_ID : ${surveyId ?? '(gagal buat survei)'}`);
  console.log('  Set LOADTEST_USERS di k6 = jumlah ini; pakai SURVEY_ID di atas.');
  console.log('─────────────────────────────────────\n');

  await ds.destroy();
}

// Hanya jalan bila dieksekusi langsung (bukan saat diimpor modul lain).
if (require.main === module) {
  main().catch((err) => {
    console.error('\nSeed load test gagal:', err?.message ?? err);
    process.exit(1);
  });
}
