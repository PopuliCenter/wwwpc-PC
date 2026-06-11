import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Kolom `enabled` pada pertanyaan untuk status 3-pilihan di builder
 * (Wajib/Opsional = enabled true; Nonaktif = enabled false → tak ditampilkan
 * ke responden). Default true agar pertanyaan lama tetap aktif.
 */
export class AddQuestionEnabled1715000011000 implements MigrationInterface {
  name = 'AddQuestionEnabled1715000011000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "question" ADD COLUMN IF NOT EXISTS "enabled" boolean NOT NULL DEFAULT true`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "question" DROP COLUMN IF EXISTS "enabled"`);
  }
}
