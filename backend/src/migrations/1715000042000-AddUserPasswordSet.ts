import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Penanda apakah user sudah punya password yang DIA pilih. Akun yang dibuat via
 * Google diberi password ACAK (passwordSet=false) → tak bisa "Ganti Password"
 * (butuh password lama), tapi bisa "Buat Password" agar login email juga aktif.
 * Baris lama dianggap sudah punya password (true).
 */
export class AddUserPasswordSet1715000042000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "password_set" boolean NOT NULL DEFAULT true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "password_set"`);
  }
}
