import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tambah kolom survey_type (nasional/daerah/lainnya) dan category (tema bebas)
 * ke tabel survey, untuk pengorganisasian survei & responden.
 */
export class AddSurveyTypeAndCategory1715000021000 implements MigrationInterface {
  name = 'AddSurveyTypeAndCategory1715000021000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'survey_type_enum') THEN
          CREATE TYPE "survey_type_enum" AS ENUM ('nasional', 'daerah', 'lainnya');
        END IF;
      END $$;
    `);
    await queryRunner.query(
      `ALTER TABLE "survey" ADD COLUMN IF NOT EXISTS "survey_type" "survey_type_enum" NOT NULL DEFAULT 'lainnya'`,
    );
    await queryRunner.query(
      `ALTER TABLE "survey" ADD COLUMN IF NOT EXISTS "category" varchar(100)`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_survey_category" ON "survey" ("category")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_survey_type" ON "survey" ("survey_type")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_survey_type"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_survey_category"`);
    await queryRunner.query(`ALTER TABLE "survey" DROP COLUMN IF EXISTS "category"`);
    await queryRunner.query(`ALTER TABLE "survey" DROP COLUMN IF EXISTS "survey_type"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "survey_type_enum"`);
  }
}
