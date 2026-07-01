import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tambah kolom provider_ref_id pada reward_redemption: ref id ringkas yang
 * dikirim ke gateway (mis. IAK) & dipakai mencocokkan callback. Dipisah dari
 * id (UUID) karena banyak gateway PPOB membatasi panjang ref_id.
 */
export class AddRedemptionProviderRefId1715000031000 implements MigrationInterface {
  name = 'AddRedemptionProviderRefId1715000031000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "reward_redemption" ADD COLUMN IF NOT EXISTS "provider_ref_id" varchar(64)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_reward_redemption_provider_ref_id" ON "reward_redemption" ("provider_ref_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_reward_redemption_provider_ref_id"`);
    await queryRunner.query(
      `ALTER TABLE "reward_redemption" DROP COLUMN IF EXISTS "provider_ref_id"`,
    );
  }
}
