import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tambah nilai 'response_submit' ke enum audit_action_type_enum. Nilai ini
 * dipakai saat mencatat pengisian survei; tanpa penambahan ini Postgres menolak
 * ("invalid input value for enum audit_action_type_enum: response_submit") dan
 * audit pengisian gagal ditulis.
 *
 * Catatan: ALTER TYPE ... ADD VALUE didukung di dalam transaksi sejak PG 12
 * (kita pakai PG 16). IF NOT EXISTS membuatnya idempoten.
 */
export class AddResponseSubmitAuditEnum1715000035000
  implements MigrationInterface
{
  name = 'AddResponseSubmitAuditEnum1715000035000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "audit_action_type_enum" ADD VALUE IF NOT EXISTS 'response_submit'`,
    );
  }

  public async down(): Promise<void> {
    // Postgres tidak mendukung penghapusan nilai enum; biarkan (no-op).
  }
}
