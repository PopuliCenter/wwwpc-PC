import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tambah kolom form_mode ke tabel survey untuk mode tampilan pengisian
 * (paginated = default lama, scroll = satu halaman, wizard = satu pertanyaan per langkah).
 */
export class AddSurveyFormMode1715000017000 implements MigrationInterface {
  name = 'AddSurveyFormMode1715000017000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DO $$ BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'survey_form_mode_enum') THEN
          CREATE TYPE "survey_form_mode_enum" AS ENUM ('paginated', 'scroll', 'wizard');
        END IF;
      END $$;`,
    );
    await queryRunner.query(
      `ALTER TABLE "survey" ADD COLUMN IF NOT EXISTS "form_mode" "survey_form_mode_enum" NOT NULL DEFAULT 'paginated'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "survey" DROP COLUMN IF EXISTS "form_mode"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "survey_form_mode_enum"`);
  }
}
