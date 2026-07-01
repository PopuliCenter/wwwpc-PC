import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Longgarkan aturan "satu respons per survei" agar surveyor (TPD) bisa mengisi
 * banyak kuesioner pada survei yang sama. Aturan unik lama (survey_id,
 * respondent_id) diganti unique index PARSIAL yang hanya berlaku untuk respons
 * mandiri responden (surveyor_id IS NULL). Respons hasil pengumpulan surveyor
 * (surveyor_id terisi) tidak dibatasi.
 */
export class RelaxResponseUniquePerSurvey1715000020000 implements MigrationInterface {
  name = 'RelaxResponseUniquePerSurvey1715000020000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "survey_response" DROP CONSTRAINT IF EXISTS "uq_one_response_per_survey"`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_one_response_per_survey"
        ON "survey_response" ("survey_id", "respondent_id")
        WHERE "surveyor_id" IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_one_response_per_survey"`);
    await queryRunner.query(`
      ALTER TABLE "survey_response"
        ADD CONSTRAINT "uq_one_response_per_survey"
        UNIQUE ("survey_id", "respondent_id")
    `);
  }
}
