import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tambah kolom untuk pengisian lapangan oleh surveyor (TPD) ke survey_response:
 * - surveyor_id + questionnaire_number (siapa surveyor & nomor kuesioner)
 * - start/end latitude & longitude (geolokasi saat buka & submit form)
 */
export class AddResponseSurveyorAndGeoFields1715000018000 implements MigrationInterface {
  name = 'AddResponseSurveyorAndGeoFields1715000018000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "survey_response"
        ADD COLUMN IF NOT EXISTS "surveyor_id" uuid,
        ADD COLUMN IF NOT EXISTS "questionnaire_number" varchar(100),
        ADD COLUMN IF NOT EXISTS "start_latitude" double precision,
        ADD COLUMN IF NOT EXISTS "start_longitude" double precision,
        ADD COLUMN IF NOT EXISTS "end_latitude" double precision,
        ADD COLUMN IF NOT EXISTS "end_longitude" double precision
    `);
    await queryRunner.query(`
      ALTER TABLE "survey_response"
        ADD CONSTRAINT "fk_survey_response_surveyor"
          FOREIGN KEY ("surveyor_id") REFERENCES "users"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_survey_response_surveyor" ON "survey_response" ("surveyor_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_survey_response_surveyor"`);
    await queryRunner.query(
      `ALTER TABLE "survey_response" DROP CONSTRAINT IF EXISTS "fk_survey_response_surveyor"`,
    );
    await queryRunner.query(`
      ALTER TABLE "survey_response"
        DROP COLUMN IF EXISTS "surveyor_id",
        DROP COLUMN IF EXISTS "questionnaire_number",
        DROP COLUMN IF EXISTS "start_latitude",
        DROP COLUMN IF EXISTS "start_longitude",
        DROP COLUMN IF EXISTS "end_latitude",
        DROP COLUMN IF EXISTS "end_longitude"
    `);
  }
}
