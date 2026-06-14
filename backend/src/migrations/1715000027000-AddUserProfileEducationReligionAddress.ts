import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tambah kolom demografi responden ke user_profile:
 * - education (pendidikan terakhir)
 * - religion  (agama)
 * - address   (alamat lengkap)
 *
 * Melengkapi data pendaftaran responden mandiri (age/gender/occupation/
 * city/province sudah ada). Semua nullable agar profil lama tetap valid.
 */
export class AddUserProfileEducationReligionAddress1715000027000
  implements MigrationInterface
{
  name = 'AddUserProfileEducationReligionAddress1715000027000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_profile" ADD COLUMN IF NOT EXISTS "education" varchar(100)`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_profile" ADD COLUMN IF NOT EXISTS "religion" varchar(50)`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_profile" ADD COLUMN IF NOT EXISTS "address" varchar(500)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_profile" DROP COLUMN IF EXISTS "address"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_profile" DROP COLUMN IF EXISTS "religion"`,
    );
    await queryRunner.query(
      `ALTER TABLE "user_profile" DROP COLUMN IF EXISTS "education"`,
    );
  }
}
