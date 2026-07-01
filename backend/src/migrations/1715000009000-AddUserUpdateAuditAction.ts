import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Menambah nilai enum 'user_update' ke audit_action_type_enum untuk fitur
 * edit data pengguna (PATCH /users/:id) di modul user-manager.
 */
export class AddUserUpdateAuditAction1715000009000 implements MigrationInterface {
  name = 'AddUserUpdateAuditAction1715000009000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "audit_action_type_enum" ADD VALUE IF NOT EXISTS 'user_update'`,
    );
  }

  public async down(): Promise<void> {
    // PostgreSQL tidak mendukung penghapusan nilai enum; no-op.
  }
}
