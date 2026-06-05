import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Menambah 4 tipe pertanyaan baru ke enum question_type_enum:
 *   - date          : tanggal saja (YYYY-MM-DD), tanpa jam
 *   - rating_scale  : skala rating dengan tampilan bintang atau angka
 *   - unique_id     : ID unik per survei (hanya angka, duplikat ditolak server)
 *   - indonesia_region : pilihan wilayah Indonesia bertingkat dengan dukungan lock
 *
 * Config tambahan disimpan di kolom validation_rules (JSONB) yang sudah ada —
 * tidak perlu perubahan skema tabel question.
 */
export class AddNewQuestionTypes1715000007 implements MigrationInterface {
  name = 'AddNewQuestionTypes1715000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "question_type_enum" ADD VALUE IF NOT EXISTS 'date'`);
    await queryRunner.query(`ALTER TYPE "question_type_enum" ADD VALUE IF NOT EXISTS 'rating_scale'`);
    await queryRunner.query(`ALTER TYPE "question_type_enum" ADD VALUE IF NOT EXISTS 'unique_id'`);
    await queryRunner.query(`ALTER TYPE "question_type_enum" ADD VALUE IF NOT EXISTS 'indonesia_region'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // PostgreSQL tidak mendukung DROP VALUE dari enum secara langsung.
    // Downgrade memerlukan rekonstruksi enum dan tabel — jarang diperlukan.
    // Sebagai pengganti, tandai nilai sebagai tidak aktif dengan komentar.
    // Jika benar-benar perlu rollback, buat tipe enum baru tanpa nilai ini
    // dan ubah kolom question.type ke tipe baru tersebut.
  }
}
