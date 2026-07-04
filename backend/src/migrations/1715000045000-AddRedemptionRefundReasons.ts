import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Menambah nilai 'redemption' & 'refund' ke point_credit_reason_enum.
 * Sebelumnya DEBIT penukaran & kredit refund memakai 'manual_credit' → analitik
 * saldo tercampur dengan kredit manual admin. Nilai baru memisahkannya.
 *
 * PostgreSQL tidak mendukung hapus nilai enum, jadi down() no-op (aman: nilai
 * lama tetap valid; kolom bisa berisi 'redemption'/'refund' bila sudah dipakai).
 */
export class AddRedemptionRefundReasons1715000045000 implements MigrationInterface {
  name = 'AddRedemptionRefundReasons1715000045000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "point_credit_reason_enum" ADD VALUE IF NOT EXISTS 'redemption'`,
    );
    await queryRunner.query(
      `ALTER TYPE "point_credit_reason_enum" ADD VALUE IF NOT EXISTS 'refund'`,
    );
  }

  public async down(): Promise<void> {
    // PostgreSQL tak mendukung DROP VALUE pada enum — biarkan (tidak merusak).
  }
}
