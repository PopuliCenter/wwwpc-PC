import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tambah nilai 'point_manual_credit' ke enum audit_action_type_enum — dipakai
 * saat mencatat kredit poin manual oleh admin (aksi bernilai uang) ke tabel audit.
 * Tanpa penambahan ini Postgres menolak nilai enum & audit gagal ditulis.
 *
 * ALTER TYPE ... ADD VALUE didukung dalam transaksi sejak PG 12 (kita pakai PG 16);
 * IF NOT EXISTS membuatnya idempoten.
 */
export class AddPointManualCreditAuditEnum1715000046000 implements MigrationInterface {
  name = 'AddPointManualCreditAuditEnum1715000046000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "audit_action_type_enum" ADD VALUE IF NOT EXISTS 'point_manual_credit'`,
    );
  }

  public async down(): Promise<void> {
    // PostgreSQL tak mendukung DROP VALUE pada enum — biarkan.
  }
}
