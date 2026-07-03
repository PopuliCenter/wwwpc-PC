import { MigrationInterface, QueryRunner } from 'typeorm';

/** Kolom otp_attempts pada reward_redemption (anti brute-force OTP per-penukaran). */
export class AddRedemptionOtpAttempts1715000044000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "reward_redemption" ADD COLUMN IF NOT EXISTS "otp_attempts" integer NOT NULL DEFAULT 0`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "reward_redemption" DROP COLUMN IF EXISTS "otp_attempts"`);
  }
}
