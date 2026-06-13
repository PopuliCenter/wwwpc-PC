import { MigrationInterface, QueryRunner } from 'typeorm';

/** Tambah nilai enum 'audio' ke question_type_enum (tipe pertanyaan rekaman audio). */
export class AddAudioQuestionType1715000016000 implements MigrationInterface {
  name = 'AddAudioQuestionType1715000016000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TYPE "question_type_enum" ADD VALUE IF NOT EXISTS 'audio'`,
    );
  }

  public async down(): Promise<void> {
    // PostgreSQL tidak mendukung penghapusan nilai enum; no-op.
  }
}
