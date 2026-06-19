import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tabel device_token — menyimpan token FCM/APNs per perangkat user untuk push
 * notifikasi. Token unik; FK ke users (CASCADE saat user dihapus).
 */
export class CreateDeviceToken1715000038000 implements MigrationInterface {
  name = 'CreateDeviceToken1715000038000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "device_token" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "token" text NOT NULL,
        "platform" varchar(16) NOT NULL DEFAULT 'android',
        "created_at" timestamp NOT NULL DEFAULT NOW(),
        "last_seen_at" timestamp NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "uq_device_token_token" ON "device_token" ("token")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_device_token_user" ON "device_token" ("user_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "device_token"`);
  }
}
