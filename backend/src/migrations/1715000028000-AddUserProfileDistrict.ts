import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tambah kolom `district` (kecamatan) ke user_profile — tingkat detail wilayah
 * domisili paling dalam yang diminta saat registrasi (provinsi → kab/kota →
 * kecamatan). Nullable agar profil lama tetap valid.
 */
export class AddUserProfileDistrict1715000028000 implements MigrationInterface {
  name = 'AddUserProfileDistrict1715000028000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_profile" ADD COLUMN IF NOT EXISTS "district" varchar(255)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_profile" DROP COLUMN IF EXISTS "district"`,
    );
  }
}
