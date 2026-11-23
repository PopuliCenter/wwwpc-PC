/**
 * Seed akun awal untuk PENGEMBANGAN LOKAL: super admin, admin, dan satu responden.
 *
 * Keamanan (audit T-01, T-04):
 * - Menolak berjalan saat NODE_ENV=production, kecuali ALLOW_SEED_IN_PRODUCTION=true.
 * - Tidak ada sandi bawaan di kode. Sandi diambil dari env; bila kosong dibuat
 *   acak dan dicetak SEKALI di terminal.
 * - Email bawaan memakai domain cadangan `.test` (RFC 2606) yang tak bisa dimiliki
 *   siapa pun. Atur alamat sendiri lewat env bila perlu.
 * - Akun yang SUDAH ADA tidak disentuh (sandi/peran/status tidak di-reset).
 *
 * Env (semuanya opsional):
 *   SEED_SUPERADMIN_EMAIL, SEED_SUPERADMIN_PASSWORD
 *   SEED_ADMIN_EMAIL,      SEED_ADMIN_PASSWORD
 *   SEED_RESPONDENT_EMAIL, SEED_RESPONDENT_PASSWORD
 *   SEED_SKIP_RESPONDENT=true  → jangan buat responden demo
 */
/* eslint-disable @typescript-eslint/no-var-requires */
const crypto = require('crypto');
const { Client } = require('pg');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

const MIN_PASSWORD_LENGTH = 12;

function assertSeedAllowed() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SEED_IN_PRODUCTION !== 'true') {
    console.error(
      'seed-admin ditolak: NODE_ENV=production. Skrip ini hanya untuk pengembangan lokal. ' +
        'Bila memang disengaja, set ALLOW_SEED_IN_PRODUCTION=true.',
    );
    process.exit(1);
  }
}

/** Sandi dari env (min. 12 karakter) atau sandi acak yang memenuhi kebijakan. */
function resolvePassword(envKey) {
  const fromEnv = process.env[envKey];
  if (fromEnv) {
    if (fromEnv.length < MIN_PASSWORD_LENGTH) {
      console.error(`${envKey} minimal ${MIN_PASSWORD_LENGTH} karakter.`);
      process.exit(1);
    }
    return { password: fromEnv, generated: false };
  }
  // Huruf besar + angka dijamin ada (kebijakan sandi aplikasi).
  return { password: `Seed${crypto.randomBytes(12).toString('base64url')}7`, generated: true };
}

async function main() {
  assertSeedAllowed();

  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_DATABASE || 'survei_online',
  });

  const accounts = [
    {
      label: 'Super Admin',
      email: (process.env.SEED_SUPERADMIN_EMAIL || 'superadmin@survei.test').toLowerCase(),
      ...resolvePassword('SEED_SUPERADMIN_PASSWORD'),
      phone: '081200000000',
      fullName: 'Super Administrator',
      role: 'super_admin',
    },
    {
      label: 'Admin',
      email: (process.env.SEED_ADMIN_EMAIL || 'admin@survei.test').toLowerCase(),
      ...resolvePassword('SEED_ADMIN_PASSWORD'),
      phone: '081200000001',
      fullName: 'Administrator',
      role: 'admin',
    },
  ];
  if (process.env.SEED_SKIP_RESPONDENT !== 'true') {
    accounts.push({
      label: 'Responden',
      email: (process.env.SEED_RESPONDENT_EMAIL || 'responden@survei.test').toLowerCase(),
      ...resolvePassword('SEED_RESPONDENT_PASSWORD'),
      phone: '081200000002',
      fullName: 'Responden Demo',
      role: 'respondent',
    });
  }

  try {
    await client.connect();
    console.log('Connected to database.');

    const created = [];
    for (const acc of accounts) {
      const hash = await bcrypt.hash(acc.password, 10);
      // ON CONFLICT DO NOTHING: menjalankan ulang TIDAK me-reset sandi atau
      // mengaktifkan kembali akun yang sudah ada (audit T-01).
      const res = await client.query(
        `INSERT INTO users (id, email, phone, password_hash, full_name, role, status, email_verified, profile_completed)
         VALUES ($1, $2, $3, $4, $5, $6, 'active', true, true)
         ON CONFLICT DO NOTHING`,
        [uuidv4(), acc.email, acc.phone, hash, acc.fullName, acc.role],
      );
      if (res.rowCount > 0) {
        created.push(acc);
        console.log(`✓ ${acc.label} dibuat: ${acc.email}`);
      } else {
        console.log(`• ${acc.label} (${acc.email}) sudah ada / bentrok — dilewati, tidak diubah.`);
      }
    }

    if (created.length > 0) {
      console.log('\n========================================');
      console.log('  AKUN SEED DIBUAT (catat sekarang, tidak ditampilkan lagi)');
      console.log('========================================');
      for (const acc of created) {
        console.log(`  ${acc.label}: ${acc.email}`);
        console.log(`    Password : ${acc.generated ? acc.password : '(dari env, tidak dicetak)'}`);
      }
      console.log('========================================');
    }

    await client.end();
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

main();
