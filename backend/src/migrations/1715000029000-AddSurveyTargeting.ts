import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tambah targeting/kelayakan survei: allowed_genders & allowed_provinces
 * (jsonb array, default []). Kosong = tanpa batasan. Kuota total tetap
 * memakai max_respondents yang sudah ada.
 */
export class AddSurveyTargeting1715000029000 implements MigrationInterface {
  name = 'AddSurveyTargeting1715000029000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "survey" ADD COLUMN IF NOT EXISTS "allowed_genders" jsonb NOT NULL DEFAULT '[]'`,
    );
    await queryRunner.query(
      `ALTER TABLE "survey" ADD COLUMN IF NOT EXISTS "allowed_provinces" jsonb NOT NULL DEFAULT '[]'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "survey" DROP COLUMN IF EXISTS "allowed_provinces"`);
    await queryRunner.query(`ALTER TABLE "survey" DROP COLUMN IF EXISTS "allowed_genders"`);
  }
}
