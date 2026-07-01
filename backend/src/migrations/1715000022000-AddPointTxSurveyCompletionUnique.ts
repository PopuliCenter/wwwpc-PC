import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Idempotensi kredit poin penyelesaian survei: satu responden hanya boleh
 * dikreditkan SEKALI per survei. Hapus duplikat lama (sisakan satu), lalu pasang
 * unique index PARSIAL pada (user_id, reference_id) untuk reason survey_completion.
 */
export class AddPointTxSurveyCompletionUnique1715000022000 implements MigrationInterface {
  name = 'AddPointTxSurveyCompletionUnique1715000022000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Bersihkan duplikat yang mungkin sudah terjadi sebelum perbaikan (keep 1).
    await queryRunner.query(`
      DELETE FROM "point_transaction" a
      USING "point_transaction" b
      WHERE a."reason" = 'survey_completion'
        AND b."reason" = 'survey_completion'
        AND a."reference_id" IS NOT NULL
        AND a."user_id" = b."user_id"
        AND a."reference_id" = b."reference_id"
        AND a.ctid > b.ctid
    `);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "uq_point_tx_survey_completion"
        ON "point_transaction" ("user_id", "reference_id")
        WHERE "reason" = 'survey_completion'
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "uq_point_tx_survey_completion"`);
  }
}
