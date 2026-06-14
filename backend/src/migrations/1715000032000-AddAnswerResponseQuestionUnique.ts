import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Tambah UNIQUE index pada answer (response_id, question_id).
 *
 * upsertAnswers memakai `INSERT ... ON CONFLICT (response_id, question_id)
 * DO UPDATE`, tetapi tabel answer hanya punya index biasa (non-unik) pada
 * masing-masing kolom. Tanpa constraint/unique-index gabungan, Postgres
 * menolak: "there is no unique or exclusion constraint matching the ON
 * CONFLICT specification" → submit/save-progress gagal (500).
 *
 * Sebelum membuat index, baris duplikat (response_id, question_id) yang
 * mungkin sudah terlanjur tersimpan dirapikan: simpan jawaban TERBARU
 * (answered_at terbesar; tiebreak ctid), hapus sisanya — agar pembuatan
 * unique index tidak gagal.
 */
export class AddAnswerResponseQuestionUnique1715000032000
  implements MigrationInterface
{
  name = 'AddAnswerResponseQuestionUnique1715000032000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Dedupe: buang duplikat lama, sisakan satu baris terbaru per pasangan.
    await queryRunner.query(`
      DELETE FROM "answer" a
      USING "answer" b
      WHERE a."response_id" = b."response_id"
        AND a."question_id" = b."question_id"
        AND (
          a."answered_at" < b."answered_at"
          OR (a."answered_at" = b."answered_at" AND a.ctid < b.ctid)
        )
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_answer_response_question"
      ON "answer" ("response_id", "question_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "uq_answer_response_question"`,
    );
  }
}
