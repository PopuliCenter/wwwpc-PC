import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tambah setelan per-survei `uppercase_answers`: bila aktif, jawaban teks
 * responden ditampilkan & disimpan dalam HURUF BESAR (konsistensi data entri).
 */
export class AddSurveyUppercaseAnswers1715000034000
  implements MigrationInterface
{
  name = 'AddSurveyUppercaseAnswers1715000034000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "survey" ADD COLUMN IF NOT EXISTS "uppercase_answers" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "survey" DROP COLUMN IF EXISTS "uppercase_answers"`,
    );
  }
}
