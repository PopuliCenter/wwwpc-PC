import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tambah nilai 'random_arm' ke enum question_type_enum — jenis pertanyaan
 * "Penugasan Acak (Eksperimen)". Tanpa penambahan ini Postgres menolak
 * ("invalid input value for enum question_type_enum: random_arm") saat builder
 * menyimpan pertanyaan arm.
 *
 * Catatan: ALTER TYPE ... ADD VALUE didukung di dalam transaksi sejak PG 12
 * (kita pakai PG 16). IF NOT EXISTS membuatnya idempoten.
 */
export class AddRandomArmQuestionType1715000037000
  implements MigrationInterface
{
  name = 'AddRandomArmQuestionType1715000037000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "question_type_enum" ADD VALUE IF NOT EXISTS 'random_arm'`,
    );
  }

  public async down(): Promise<void> {
    // Postgres tidak mendukung penghapusan nilai enum; biarkan (no-op).
  }
}
