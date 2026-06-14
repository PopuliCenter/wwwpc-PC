import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tambah kolom date_of_birth pada user_profile. Pendaftaran kini meminta
 * tanggal lahir; usia (kolom `age`) dihitung otomatis dari tanggal ini agar
 * konsumen lama (eligibility, distribusi, export) tetap berjalan.
 */
export class AddUserProfileDateOfBirth1715000033000
  implements MigrationInterface
{
  name = 'AddUserProfileDateOfBirth1715000033000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_profile" ADD COLUMN IF NOT EXISTS "date_of_birth" date`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "user_profile" DROP COLUMN IF EXISTS "date_of_birth"`,
    );
  }
}
