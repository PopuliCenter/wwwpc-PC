import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tambah setelan alat pendukung ke tabel survey:
 * - capture_gps      : rekam lokasi GPS otomatis (awal & akhir pengisian)
 * - require_signature: minta tanda tangan responden di akhir pengisian
 *
 * Keduanya menggantikan peran tipe pertanyaan 'gps' & 'signature' sebagai
 * setelan tingkat survei (bukan pertanyaan). Tipe pertanyaan lama tetap ada
 * demi kompatibilitas data survei yang sudah dibuat.
 */
export class AddSurveyGpsSignatureSettings1715000026000
  implements MigrationInterface
{
  name = 'AddSurveyGpsSignatureSettings1715000026000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "survey" ADD COLUMN IF NOT EXISTS "capture_gps" boolean NOT NULL DEFAULT false`,
    );
    await queryRunner.query(
      `ALTER TABLE "survey" ADD COLUMN IF NOT EXISTS "require_signature" boolean NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "survey" DROP COLUMN IF EXISTS "require_signature"`,
    );
    await queryRunner.query(
      `ALTER TABLE "survey" DROP COLUMN IF EXISTS "capture_gps"`,
    );
  }
}
