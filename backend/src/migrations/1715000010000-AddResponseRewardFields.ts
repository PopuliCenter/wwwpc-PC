import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Kolom reward per-respons: nomor tujuan + jenis reward yang diisi RESPONDEN
 * saat submit (survei mode manual), serta status distribusi untuk rekonsiliasi
 * oleh admin (top-up pulsa/e-wallet).
 */
export class AddResponseRewardFields1715000010000 implements MigrationInterface {
  name = 'AddResponseRewardFields1715000010000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "survey_response"
        ADD COLUMN IF NOT EXISTS "destination_number" varchar(50),
        ADD COLUMN IF NOT EXISTS "reward_type" varchar(30),
        ADD COLUMN IF NOT EXISTS "reward_distributed" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "reward_distributed_at" timestamp,
        ADD COLUMN IF NOT EXISTS "reward_distributed_by" uuid
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "survey_response"
        DROP COLUMN IF EXISTS "reward_distributed_by",
        DROP COLUMN IF EXISTS "reward_distributed_at",
        DROP COLUMN IF EXISTS "reward_distributed",
        DROP COLUMN IF EXISTS "reward_type",
        DROP COLUMN IF EXISTS "destination_number"
    `);
  }
}
