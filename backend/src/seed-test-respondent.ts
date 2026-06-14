/**
 * Seed responden uji untuk menguji penukaran reward (mis. IAK sandbox).
 *
 * Membuat (atau memakai ulang) satu akun responden AKTIF + memberi saldo poin,
 * sehingga bisa langsung login & menukar reward. Idempoten: aman dijalankan
 * berulang (kredit poin seed tidak digandakan).
 *
 * Jalankan di VPS (di dalam container backend yang sudah ter-build):
 *   docker compose exec backend node dist/seed-test-respondent.js
 *
 * Atur via env (opsional):
 *   SEED_EMAIL (default responden.uji@populicenter.org)
 *   SEED_PASSWORD (default Test1234)
 *   SEED_NAME (default "Responden Uji")
 *   SEED_PHONE (default 081988888888)
 *   SEED_POINTS (default 100000)
 */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
import { User, UserStatus } from './modules/auth/entities';
import { UserRole, PointCreditReason } from './shared/enums';
import {
  PointTransaction,
  TransactionType,
} from './modules/reward/entities/point-transaction.entity';

dotenv.config();

// Penanda kredit seed agar tidak digandakan saat dijalankan berulang.
const SEED_CREDIT_REF = '00000000-0000-0000-0000-0000000000ee';

async function main(): Promise<void> {
  const email = process.env.SEED_EMAIL || 'responden.uji@populicenter.org';
  const password = process.env.SEED_PASSWORD || 'Test1234';
  const fullName = process.env.SEED_NAME || 'Responden Uji';
  const phone = process.env.SEED_PHONE || '081988888888';
  const points = parseInt(process.env.SEED_POINTS || '100000', 10);

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

  // 1) Akun responden ----------------------------------------------------------
  let user = await userRepo.findOne({ where: { email } });
  if (!user) {
    // Cegah bentrok nomor telepon (unik).
    const phoneTaken = await userRepo.findOne({ where: { phone } });
    if (phoneTaken) {
      throw new Error(
        `Nomor telepon ${phone} sudah dipakai user lain. Set SEED_PHONE ke nomor lain.`,
      );
    }
    user = userRepo.create({
      email,
      phone,
      passwordHash: await bcrypt.hash(password, 10),
      fullName,
      role: UserRole.RESPONDENT,
      status: UserStatus.ACTIVE,
      emailVerified: true,
      profileCompleted: true,
    });
    user = await userRepo.save(user);
    console.log(`✓ Responden dibuat: ${email}`);
  } else {
    // Pastikan bisa login & menukar: aktif + role responden + password diset.
    user.role = UserRole.RESPONDENT;
    user.status = UserStatus.ACTIVE;
    user.emailVerified = true;
    user.passwordHash = await bcrypt.hash(password, 10);
    await userRepo.save(user);
    console.log(`✓ Responden sudah ada, dipakai ulang & password direset: ${email}`);
  }

  // 2) Saldo poin (idempoten via referenceId penanda) --------------------------
  const existingSeedCredit = await txRepo.findOne({
    where: { userId: user.id, referenceId: SEED_CREDIT_REF },
  });
  if (existingSeedCredit) {
    console.log('• Kredit poin seed sudah ada — dilewati (idempoten).');
  } else {
    const earnedAt = new Date();
    const expiresAt = new Date(earnedAt);
    expiresAt.setMonth(expiresAt.getMonth() + 12);
    await txRepo.save(
      txRepo.create({
        userId: user.id,
        amount: points,
        transactionType: TransactionType.CREDIT,
        reason: PointCreditReason.MANUAL_CREDIT,
        referenceId: SEED_CREDIT_REF,
        earnedAt,
        expiresAt,
        expired: false,
      }),
    );
    console.log(`✓ ${points.toLocaleString('en-US')} poin dikreditkan.`);
  }

  // 3) Ringkasan ---------------------------------------------------------------
  const credited = await txRepo
    .createQueryBuilder('t')
    .select('COALESCE(SUM(t.amount),0)', 'sum')
    .where('t.user_id = :id', { id: user.id })
    .andWhere("t.transaction_type = 'credit'")
    .andWhere('t.expired = false')
    .getRawOne<{ sum: string }>();

  console.log('\n──────── Akun uji penukaran reward ────────');
  console.log(`  Email    : ${email}`);
  console.log(`  Password : ${password}`);
  console.log(`  Saldo    : ~${Number(credited?.sum ?? 0).toLocaleString('en-US')} poin (kredit)`);
  console.log('───────────────────────────────────────────');
  console.log('Login sbg responden → Reward → tukar Pulsa Rp 5.000.\n');

  await ds.destroy();
}

main().catch((err) => {
  console.error('Seed gagal:', err?.message ?? err);
  process.exit(1);
});
