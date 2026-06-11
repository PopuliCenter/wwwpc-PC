import { MigrationInterface, QueryRunner } from 'typeorm';

/** Tambah nilai enum 'gps' ke question_type_enum (tipe pertanyaan titik GPS). */
export class AddGpsQuestionType1715000014000 implements MigrationInterface {
  name = 'AddGpsQuestionType1715000014000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "question_type_enum" ADD VALUE IF NOT EXISTS 'gps'`,
    );
  }

  public async down(): Promise<void> {
    // PostgreSQL tidak mendukung penghapusan nilai enum; no-op.
  }
}
