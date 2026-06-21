import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Jadikan kolom users.phone NULLABLE. Login Google membuat akun tanpa nomor HP
 * (Google tidak menyediakannya), jadi phone tidak lagi wajib. Indeks unik phone
 * tetap berlaku — Postgres mengizinkan banyak NULL pada unique index.
 */
export class MakeUserPhoneNullable1715000039000 implements MigrationInterface {
  name = 'MakeUserPhoneNullable1715000039000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "phone" DROP NOT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Tidak mengembalikan NOT NULL otomatis (bisa gagal bila sudah ada baris NULL).
    await queryRunner.query(
      `ALTER TABLE "users" ALTER COLUMN "phone" SET NOT NULL`,
    );
  }
}
