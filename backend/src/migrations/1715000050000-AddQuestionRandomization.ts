import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Acak urutan pertanyaan berbasis BLOK.
 *
 * - `randomize_group`: nama blok acak. NULL = pertanyaan tidak pernah diacak.
 *   Pertanyaan dengan nama blok sama diacak DI ANTARA posisi mereka sendiri,
 *   sehingga blok tetap berada di rentang yang sama pada kuesioner (penting
 *   agar rentang 'jump_to' yang memakai order_index tetap benar).
 * - `pin_position`: pertanyaan tetap di posisi aslinya meski bloknya diacak
 *   (mis. pertanyaan pengantar blok).
 *
 * Blok TIDAK dipakai pada bagian data diri/penyaring — bagian itu dibiarkan
 * `randomize_group = NULL` supaya urutannya sama dengan kuesioner cetak TPD.
 */
export class AddQuestionRandomization1715000050000 implements MigrationInterface {
  name = 'AddQuestionRandomization1715000050000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "question" ADD COLUMN IF NOT EXISTS "randomize_group" character varying(50)`,
    );
    await queryRunner.query(
      `ALTER TABLE "question" ADD COLUMN IF NOT EXISTS "pin_position" boolean NOT NULL DEFAULT false`,
    );
    // Dipakai saat merakit pengisian: ambil anggota blok per survei.
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_question_randomize_group" ON "question" ("survey_id", "randomize_group")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_question_randomize_group"`);
    await queryRunner.query(`ALTER TABLE "question" DROP COLUMN IF EXISTS "pin_position"`);
    await queryRunner.query(`ALTER TABLE "question" DROP COLUMN IF EXISTS "randomize_group"`);
  }
}
