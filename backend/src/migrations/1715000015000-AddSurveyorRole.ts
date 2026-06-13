import { MigrationInterface, QueryRunner } from 'typeorm';

/** Tambah nilai enum 'surveyor' ke user_role_enum (role Surveyor/TPD). */
export class AddSurveyorRole1715000015000 implements MigrationInterface {
  name = 'AddSurveyorRole1715000015000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "user_role_enum" ADD VALUE IF NOT EXISTS 'surveyor'`,
    );
  }

  public async down(): Promise<void> {
    // PostgreSQL tidak mendukung penghapusan nilai enum; no-op.
  }
}
