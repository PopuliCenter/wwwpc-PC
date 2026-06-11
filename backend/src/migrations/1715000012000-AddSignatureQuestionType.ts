import { MigrationInterface, QueryRunner } from 'typeorm';

/** Tambah nilai enum 'signature' ke question_type_enum (tipe pertanyaan tanda tangan). */
export class AddSignatureQuestionType1715000012000 implements MigrationInterface {
  name = 'AddSignatureQuestionType1715000012000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "question_type_enum" ADD VALUE IF NOT EXISTS 'signature'`,
    );
  }

  public async down(): Promise<void> {
    // PostgreSQL tidak mendukung penghapusan nilai enum; no-op.
  }
}
