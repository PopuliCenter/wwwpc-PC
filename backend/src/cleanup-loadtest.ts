/**
 * Bersihkan data uji beban. Dua mode (env LOADTEST_CLEANUP):
 *   responses (default) — hapus RESPONS milik akun loadtest (agar bisa submit
 *                         lagi pada re-run; akun tetap ada).
 *   all                 — hapus respons + poin + PROFIL + AKUN loadtest.
 *
 * Jalankan di dalam container:
 *   docker compose exec -e LOADTEST_CLEANUP=responses backend node dist/cleanup-loadtest.js
 *
 * Aman: hanya menyentuh baris yang email-nya cocok pola loadtest+...@loadtest.local.
 */
import 'reflect-metadata';
import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
import { LOADTEST_EMAIL_PREFIX, LOADTEST_EMAIL_DOMAIN } from './seed-loadtest';

dotenv.config();

async function main(): Promise<void> {
  const mode = (process.env.LOADTEST_CLEANUP || 'responses').toLowerCase();
  const like = `${LOADTEST_EMAIL_PREFIX}%${LOADTEST_EMAIL_DOMAIN}`;

  const ds = new DataSource({
    type: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_DATABASE || 'survei_online',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    synchronize: false,
  });
  await ds.initialize();

  // Sub-query id akun loadtest (dipakai berulang).
  const idSub = `SELECT id FROM users WHERE email LIKE $1`;

  // Respons (answer ikut terhapus via FK CASCADE).
  const resp = await ds.query(`DELETE FROM survey_response WHERE respondent_id IN (${idSub})`, [
    like,
  ]);
  console.log(`✓ Respons loadtest dihapus: ${resp?.[1] ?? resp?.rowCount ?? '?'}`);

  if (mode === 'all') {
    await ds.query(`DELETE FROM point_transaction WHERE user_id IN (${idSub})`, [like]);
    await ds.query(`DELETE FROM user_profile WHERE user_id IN (${idSub})`, [like]);
    const users = await ds.query(`DELETE FROM users WHERE email LIKE $1`, [like]);
    console.log(`✓ Akun loadtest dihapus: ${users?.[1] ?? users?.rowCount ?? '?'}`);
  } else {
    console.log(
      '• Akun loadtest DIPERTAHANKAN (mode responses). Set LOADTEST_CLEANUP=all untuk hapus akun.',
    );
  }

  await ds.destroy();
}

main().catch((err) => {
  console.error('Cleanup load test gagal:', err?.message ?? err);
  process.exit(1);
});
