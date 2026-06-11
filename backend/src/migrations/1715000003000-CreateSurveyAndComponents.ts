import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSurveyAndComponents1715000003000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enum types for survey module
    await queryRunner.query(`
      CREATE TYPE "survey_status_enum" AS ENUM (
        'draft', 'active', 'inactive', 'archived'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "reward_mode_enum" AS ENUM (
        'automatic', 'manual'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "question_type_enum" AS ENUM (
        'single_choice', 'multiple_choice', 'short_text', 'long_text',
        'phone_number', 'numeric_scale', 'dropdown', 'matrix_likert',
        'file_upload', 'date_time'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "skip_logic_action_enum" AS ENUM (
        'skip', 'jump_to'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "visibility_action_enum" AS ENUM (
        'show', 'hide'
      )
    `);

    // Create survey table
    await queryRunner.query(`
      CREATE TABLE "survey" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "created_by" uuid NOT NULL,
        "title" varchar(500) NOT NULL,
        "description" text,
        "status" "survey_status_enum" NOT NULL DEFAULT 'draft',
        "reward_mode" "reward_mode_enum" NOT NULL DEFAULT 'automatic',
        "start_datetime" timestamp,
        "end_datetime" timestamp,
        "max_duration_minutes" int,
        "max_respondents" int,
        "randomize_options" boolean NOT NULL DEFAULT false,
        "created_at" timestamp NOT NULL DEFAULT NOW(),
        "updated_at" timestamp NOT NULL DEFAULT NOW(),
        "archived_at" timestamp,
        CONSTRAINT "pk_survey" PRIMARY KEY ("id"),
        CONSTRAINT "fk_survey_created_by" FOREIGN KEY ("created_by")
          REFERENCES "users"("id") ON DELETE RESTRICT
      )
    `);

    // Create survey_page table
    await queryRunner.query(`
      CREATE TABLE "survey_page" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "survey_id" uuid NOT NULL,
        "page_number" int NOT NULL,
        "title" varchar(500),
        "order_index" int NOT NULL DEFAULT 0,
        CONSTRAINT "pk_survey_page" PRIMARY KEY ("id"),
        CONSTRAINT "fk_survey_page_survey" FOREIGN KEY ("survey_id")
          REFERENCES "survey"("id") ON DELETE CASCADE
      )
    `);

    // Create question table
    await queryRunner.query(`
      CREATE TABLE "question" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "survey_id" uuid NOT NULL,
        "page_id" uuid NOT NULL,
        "type" "question_type_enum" NOT NULL,
        "question_text" text NOT NULL,
        "required" boolean NOT NULL DEFAULT false,
        "order_index" int NOT NULL DEFAULT 0,
        "validation_rules" jsonb,
        "has_other_option" boolean NOT NULL DEFAULT false,
        "created_at" timestamp NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_question" PRIMARY KEY ("id"),
        CONSTRAINT "fk_question_survey" FOREIGN KEY ("survey_id")
          REFERENCES "survey"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_question_page" FOREIGN KEY ("page_id")
          REFERENCES "survey_page"("id") ON DELETE CASCADE
      )
    `);

    // Create question_option table
    await queryRunner.query(`
      CREATE TABLE "question_option" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "question_id" uuid NOT NULL,
        "label" varchar(500) NOT NULL,
        "value" varchar(500) NOT NULL,
        "order_index" int NOT NULL DEFAULT 0,
        CONSTRAINT "pk_question_option" PRIMARY KEY ("id"),
        CONSTRAINT "fk_question_option_question" FOREIGN KEY ("question_id")
          REFERENCES "question"("id") ON DELETE CASCADE
      )
    `);

    // Create skip_logic_rule table
    await queryRunner.query(`
      CREATE TABLE "skip_logic_rule" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "question_id" uuid NOT NULL,
        "source_question_id" uuid NOT NULL,
        "condition_operator" varchar(50) NOT NULL,
        "condition_value" varchar(500) NOT NULL,
        "action" "skip_logic_action_enum" NOT NULL,
        "target_question_id" uuid,
        CONSTRAINT "pk_skip_logic_rule" PRIMARY KEY ("id"),
        CONSTRAINT "fk_skip_logic_question" FOREIGN KEY ("question_id")
          REFERENCES "question"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_skip_logic_source_question" FOREIGN KEY ("source_question_id")
          REFERENCES "question"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_skip_logic_target_question" FOREIGN KEY ("target_question_id")
          REFERENCES "question"("id") ON DELETE SET NULL
      )
    `);

    // Create visibility_rule table
    await queryRunner.query(`
      CREATE TABLE "visibility_rule" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "question_id" uuid NOT NULL,
        "source_question_id" uuid NOT NULL,
        "condition_operator" varchar(50) NOT NULL,
        "condition_value" varchar(500) NOT NULL,
        "visibility_action" "visibility_action_enum" NOT NULL,
        CONSTRAINT "pk_visibility_rule" PRIMARY KEY ("id"),
        CONSTRAINT "fk_visibility_rule_question" FOREIGN KEY ("question_id")
          REFERENCES "question"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_visibility_rule_source_question" FOREIGN KEY ("source_question_id")
          REFERENCES "question"("id") ON DELETE CASCADE
      )
    `);

    // Create branching_rule table
    await queryRunner.query(`
      CREATE TABLE "branching_rule" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "page_id" uuid NOT NULL,
        "source_question_id" uuid NOT NULL,
        "condition_operator" varchar(50) NOT NULL,
        "condition_value" varchar(500) NOT NULL,
        "target_page_id" uuid NOT NULL,
        CONSTRAINT "pk_branching_rule" PRIMARY KEY ("id"),
        CONSTRAINT "fk_branching_rule_page" FOREIGN KEY ("page_id")
          REFERENCES "survey_page"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_branching_rule_source_question" FOREIGN KEY ("source_question_id")
          REFERENCES "question"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_branching_rule_target_page" FOREIGN KEY ("target_page_id")
          REFERENCES "survey_page"("id") ON DELETE CASCADE
      )
    `);

    // Create survey_time_config table
    await queryRunner.query(`
      CREATE TABLE "survey_time_config" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "survey_id" uuid NOT NULL,
        "start_datetime" timestamp,
        "end_datetime" timestamp,
        "max_duration_minutes" int,
        "max_respondents" int,
        "current_respondent_count" int NOT NULL DEFAULT 0,
        CONSTRAINT "pk_survey_time_config" PRIMARY KEY ("id"),
        CONSTRAINT "fk_survey_time_config_survey" FOREIGN KEY ("survey_id")
          REFERENCES "survey"("id") ON DELETE CASCADE,
        CONSTRAINT "uq_survey_time_config_survey_id" UNIQUE ("survey_id")
      )
    `);

    // Create survey_reward_config table
    await queryRunner.query(`
      CREATE TABLE "survey_reward_config" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "survey_id" uuid NOT NULL,
        "reward_mode" "reward_mode_enum" NOT NULL,
        "points_value" int,
        "manual_reward_type" varchar(255),
        "manual_reward_nominal" decimal(12, 2),
        CONSTRAINT "pk_survey_reward_config" PRIMARY KEY ("id"),
        CONSTRAINT "fk_survey_reward_config_survey" FOREIGN KEY ("survey_id")
          REFERENCES "survey"("id") ON DELETE CASCADE,
        CONSTRAINT "uq_survey_reward_config_survey_id" UNIQUE ("survey_id")
      )
    `);

    // Create indexes for performance
    await queryRunner.query(`
      CREATE INDEX "idx_survey_status" ON "survey"("status")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_survey_created_by" ON "survey"("created_by")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_survey_page_survey_id" ON "survey_page"("survey_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_question_survey_id" ON "question"("survey_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_question_page_id" ON "question"("page_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_question_option_question_id" ON "question_option"("question_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_question_option_question_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_question_page_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_question_survey_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_survey_page_survey_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_survey_created_by"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_survey_status"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "survey_reward_config"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "survey_time_config"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "branching_rule"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "visibility_rule"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "skip_logic_rule"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "question_option"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "question"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "survey_page"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "survey"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "visibility_action_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "skip_logic_action_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "question_type_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "reward_mode_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "survey_status_enum"`);
  }
}
