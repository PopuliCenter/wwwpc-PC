import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Arsip respons: tambah kolom `archived_at`. Respons yang diarsipkan tidak lagi
 * memblokir pengisian ulang — index unik "satu respons per survei" dibuat ulang
 * sebagai PARSIAL: hanya berlaku untuk respons mandiri (surveyor_id IS NULL) yang
 * BELUM diarsipkan (archived_at IS NULL). Datanya tetap tersimpan (tidak dihapus).
 */
export class AddResponseArchivedAt1715000036000 implements MigrationInterface {
  name = 'AddResponseArchivedAt1715000036000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "survey_response" ADD COLUMN IF NOT EXISTS "archived_at" timestamp`,
    );
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_one_response_per_survey"`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_one_response_per_survey"
        ON "survey_response" ("survey_id", "respondent_id")
        WHERE "surveyor_id" IS NULL AND "archived_at" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_one_response_per_survey"`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_one_response_per_survey"
        ON "survey_response" ("survey_id", "respondent_id")
        WHERE "surveyor_id" IS NULL
    `);
    await queryRunner.query(`ALTER TABLE "survey_response" DROP COLUMN IF EXISTS "archived_at"`);
  }
}
