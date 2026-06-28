import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tabel log error sisi-klien (frontend/aplikasi) untuk monitoring & perbaikan.
 * Menyimpan pesan + stack + konteks perangkat (platform, tipe device, versi app,
 * route, user) agar admin mudah menelusuri dan memperbaiki bug.
 */
export class CreateClientLog1715000043000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "client_log" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "level" varchar(16) NOT NULL DEFAULT 'error',
        "message" text NOT NULL,
        "stack" text,
        "source" varchar(500),
        "platform" varchar(20),
        "device_type" varchar(20),
        "app_version" varchar(40),
        "user_agent" varchar(500),
        "user_id" uuid,
        "user_email" varchar(255),
        "context" jsonb,
        "ip_address" varchar(64),
        "created_at" timestamp NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_client_log" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_client_log_created_at" ON "client_log"("created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_client_log_level" ON "client_log"("level")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_client_log_platform" ON "client_log"("platform")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "client_log"`);
  }
}
