import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tambah kolom integrasi provider fulfillment pada reward_redemption:
 * provider, provider_trx_id, provider_sn, provider_message, refunded.
 * Dipakai oleh adapter IAK (dan provider PPOB lain) + mekanisme refund-on-failure.
 */
export class AddRedemptionProviderFields1715000030000
  implements MigrationInterface
{
  name = 'AddRedemptionProviderFields1715000030000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "reward_redemption" ADD COLUMN IF NOT EXISTS "provider" varchar(20)`,
    );
    await queryRunner.query(
      `ALTER TABLE "reward_redemption" ADD COLUMN IF NOT EXISTS "provider_trx_id" varchar(100)`,
    );
    await queryRunner.query(
      `ALTER TABLE "reward_redemption" ADD COLUMN IF NOT EXISTS "provider_sn" varchar(255)`,
    );
    await queryRunner.query(
      `ALTER TABLE "reward_redemption" ADD COLUMN IF NOT EXISTS "provider_message" varchar(500)`,
    );
    await queryRunner.query(
      `ALTER TABLE "reward_redemption" ADD COLUMN IF NOT EXISTS "refunded" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "reward_redemption" DROP COLUMN IF EXISTS "refunded"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reward_redemption" DROP COLUMN IF EXISTS "provider_message"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reward_redemption" DROP COLUMN IF EXISTS "provider_sn"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reward_redemption" DROP COLUMN IF EXISTS "provider_trx_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "reward_redemption" DROP COLUMN IF EXISTS "provider"`,
    );
  }
}
