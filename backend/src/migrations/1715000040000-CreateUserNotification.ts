import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tabel user_notification — feed notifikasi dalam aplikasi (lonceng) per user.
 * Diisi otomatis (survei baru) atau dari Pengumuman admin (broadcast).
 */
export class CreateUserNotification1715000040000 implements MigrationInterface {
  name = 'CreateUserNotification1715000040000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_notification" (
        "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "type" varchar(32) NOT NULL,
        "title" varchar(200) NOT NULL,
        "body" text NOT NULL,
        "link" varchar(500),
        "read_at" timestamp,
        "created_at" timestamp NOT NULL DEFAULT NOW()
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_user_notification_user_read" ON "user_notification" ("user_id", "read_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "user_notification"`);
  }
}
