import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateResponseAndAnswer1715000004000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enum for response status
    await queryRunner.query(`
      CREATE TYPE "response_status_enum" AS ENUM (
        'in_progress', 'complete', 'abandoned'
      )
    `);

    // Create survey_response table
    await queryRunner.query(`
      CREATE TABLE "survey_response" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "survey_id" uuid NOT NULL,
        "respondent_id" uuid NOT NULL,
        "status" "response_status_enum" NOT NULL DEFAULT 'in_progress',
        "device_type" varchar(50),
        "started_at" timestamp NOT NULL DEFAULT NOW(),
        "submitted_at" timestamp,
        "exported_at" timestamp,
        "tags" jsonb,
        CONSTRAINT "pk_survey_response" PRIMARY KEY ("id"),
        CONSTRAINT "fk_survey_response_survey" FOREIGN KEY ("survey_id")
          REFERENCES "survey"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_survey_response_respondent" FOREIGN KEY ("respondent_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "uq_one_response_per_survey" UNIQUE ("survey_id", "respondent_id")
      )
    `);

    // Create answer table
    await queryRunner.query(`
      CREATE TABLE "answer" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "response_id" uuid NOT NULL,
        "question_id" uuid NOT NULL,
        "value" jsonb,
        "answered_at" timestamp NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_answer" PRIMARY KEY ("id"),
        CONSTRAINT "fk_answer_response" FOREIGN KEY ("response_id")
          REFERENCES "survey_response"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_answer_question" FOREIGN KEY ("question_id")
          REFERENCES "question"("id") ON DELETE CASCADE
      )
    `);

    // Create indexes for performance
    await queryRunner.query(`
      CREATE INDEX "idx_survey_response_survey_id" ON "survey_response"("survey_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_survey_response_respondent_id" ON "survey_response"("respondent_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_survey_response_status" ON "survey_response"("status")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_survey_response_submitted_at" ON "survey_response"("submitted_at")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_survey_response_survey_status" ON "survey_response"("survey_id", "status")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_answer_response_id" ON "answer"("response_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_answer_question_id" ON "answer"("question_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_answer_question_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_answer_response_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_survey_response_survey_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_survey_response_submitted_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_survey_response_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_survey_response_respondent_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_survey_response_survey_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "answer"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "survey_response"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "response_status_enum"`);
  }
}
