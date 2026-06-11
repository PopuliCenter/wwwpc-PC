import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Menambah nilai enum action audit yang dipakai modul user-manager tetapi
 * belum ada di tipe Postgres `audit_action_type_enum` (migrasi awal berhenti di
 * 'manual_reward_distribution'). Tanpa ini, aktivasi/nonaktifkan/reset-password/
 * buat user gagal 500 saat menulis audit log.
 */
export class AddUserAuditActionTypes1715000008000 implements MigrationInterface {
  name = 'AddUserAuditActionTypes1715000008000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "audit_action_type_enum" ADD VALUE IF NOT EXISTS 'user_create'`);
    await queryRunner.query(`ALTER TYPE "audit_action_type_enum" ADD VALUE IF NOT EXISTS 'user_activate'`);
    await queryRunner.query(`ALTER TYPE "audit_action_type_enum" ADD VALUE IF NOT EXISTS 'user_deactivate'`);
    await queryRunner.query(`ALTER TYPE "audit_action_type_enum" ADD VALUE IF NOT EXISTS 'user_password_reset'`);
    await queryRunner.query(`ALTER TYPE "audit_action_type_enum" ADD VALUE IF NOT EXISTS 'user_bulk_import'`);
  }

  public async down(): Promise<void> {
    // PostgreSQL tidak mendukung penghapusan nilai dari enum secara langsung.
    // Tidak ada operasi rollback yang aman; dibiarkan no-op.
  }
}
