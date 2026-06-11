import { MigrationInterface, QueryRunner } from 'typeorm';

/** Tambah nilai enum 'photo' ke question_type_enum (tipe pertanyaan foto kamera). */
export class AddPhotoQuestionType1715000013000 implements MigrationInterface {
  name = 'AddPhotoQuestionType1715000013000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "question_type_enum" ADD VALUE IF NOT EXISTS 'photo'`,
    );
  }

  public async down(): Promise<void> {
    // PostgreSQL tidak mendukung penghapusan nilai enum; no-op.
  }
}
