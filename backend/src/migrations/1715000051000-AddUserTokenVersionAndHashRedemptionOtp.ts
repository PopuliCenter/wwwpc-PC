import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Audit keamanan 23 Nov 2026, Tahap 1.
 *
 * 1. `users.token_version` (T-11, T-05): versi sesi per user. Setiap token JWT
 *    membawa klaim `tv`; JwtStrategy menolak token yang `tv`-nya tidak sama
 *    dengan nilai di DB. Menaikkan kolom ini = mencabut SEMUA sesi user
 *    (nonaktif, reset sandi oleh admin, ganti peran, ganti/reset sandi sendiri).
 *    Token lama (sebelum migrasi) tidak membawa `tv` sehingga semua pengguna
 *    perlu login ulang sekali setelah deploy.
 *
 * 2. `reward_redemption.otp_code` diperlebar ke 128 karakter (T-13): OTP
 *    penukaran kini disimpan sebagai HMAC-SHA256 (hex 64), bukan plaintext.
 *    OTP plaintext yang masih tersimpan (penukaran PENDING sebelum deploy)
 *    dikosongkan; pengguna cukup menekan "kirim ulang OTP".
 */
export class AddUserTokenVersionAndHashRedemptionOtp1715000051000 implements MigrationInterface {
  name = 'AddUserTokenVersionAndHashRedemptionOtp1715000051000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "token_version" integer NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "reward_redemption" ALTER COLUMN "otp_code" TYPE character varying(128)`,
    );
    await queryRunner.query(
      `UPDATE "reward_redemption" SET "otp_code" = NULL WHERE "otp_code" IS NOT NULL AND length("otp_code") <= 10`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Hash tidak muat di varchar(10) → kosongkan dulu (pengguna kirim ulang OTP).
    await queryRunner.query(
      `UPDATE "reward_redemption" SET "otp_code" = NULL WHERE length("otp_code") > 10`,
    );
    await queryRunner.query(
      `ALTER TABLE "reward_redemption" ALTER COLUMN "otp_code" TYPE character varying(10)`,
    );
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "token_version"`);
  }
}
