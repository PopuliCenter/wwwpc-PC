import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Kunci idempotensi pengiriman dari klien (client_submission_id) untuk
 * pengisian offline → sync: bila pengiriman terulang setelah online kembali,
 * unique index parsial mencegah respons duplikat.
 */
export class AddClientSubmissionId1715000025000 implements MigrationInterface {
  name = 'AddClientSubmissionId1715000025000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "survey_response" ADD COLUMN IF NOT EXISTS "client_submission_id" uuid`,
    );
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_survey_response_client_submission"
        ON "survey_response" ("client_submission_id")
        WHERE "client_submission_id" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_survey_response_client_submission"`,
    );
    await queryRunner.query(
      `ALTER TABLE "survey_response" DROP COLUMN IF EXISTS "client_submission_id"`,
    );
  }
}
