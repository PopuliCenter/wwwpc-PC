import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tabel pending_deletion: antrian permintaan penghapusan data yang menunggu
 * konfirmasi. Dipindah dari Map di memori ke DB agar tahan restart aplikasi.
 */
export class CreatePendingDeletion1715000024000 implements MigrationInterface {
  name = 'CreatePendingDeletion1715000024000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "pending_deletion" (
        "id" uuid NOT NULL,
        "confirmation_token" uuid NOT NULL,
        "filters" jsonb NOT NULL,
        "affected_count" integer NOT NULL,
        "admin_user_id" uuid NOT NULL,
        "confirmed" boolean NOT NULL DEFAULT false,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "expires_at" TIMESTAMP NOT NULL,
        CONSTRAINT "pk_pending_deletion" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_pending_deletion_expires_at" ON "pending_deletion" ("expires_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "pending_deletion"`);
  }
}
