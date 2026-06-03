import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateAuditExportAndCleanup1715000006 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enum types
    await queryRunner.query(`
      CREATE TYPE "audit_action_type_enum" AS ENUM (
        'login', 'logout',
        'survey_create', 'survey_update', 'survey_delete', 'survey_archive',
        'question_create', 'question_update', 'question_delete',
        'notification_sent',
        'data_export',
        'role_change',
        'data_cleanup',
        'reward_redemption',
        'manual_reward_distribution'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "export_format_enum" AS ENUM (
        'csv', 'excel', 'pdf', 'json'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "export_status_enum" AS ENUM (
        'pending', 'processing', 'completed', 'failed'
      )
    `);

    // Create audit_log table
    await queryRunner.query(`
      CREATE TABLE "audit_log" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid,
        "action_type" "audit_action_type_enum" NOT NULL,
        "module" varchar(100) NOT NULL,
        "details" jsonb,
        "ip_address" inet,
        "created_at" timestamp NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_audit_log" PRIMARY KEY ("id"),
        CONSTRAINT "fk_audit_log_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    // Create export_job table
    await queryRunner.query(`
      CREATE TABLE "export_job" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "requested_by" uuid NOT NULL,
        "format" "export_format_enum" NOT NULL,
        "status" "export_status_enum" NOT NULL DEFAULT 'pending',
        "file_path" varchar(500),
        "filters_applied" jsonb,
        "created_at" timestamp NOT NULL DEFAULT NOW(),
        "completed_at" timestamp,
        CONSTRAINT "pk_export_job" PRIMARY KEY ("id"),
        CONSTRAINT "fk_export_job_requested_by" FOREIGN KEY ("requested_by")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    // Create otp_verification table
    await queryRunner.query(`
      CREATE TABLE "otp_verification" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "email" varchar(255) NOT NULL,
        "otp_code" varchar(10) NOT NULL,
        "attempt_count" int NOT NULL DEFAULT 0,
        "resend_count" int NOT NULL DEFAULT 0,
        "created_at" timestamp NOT NULL DEFAULT NOW(),
        "expires_at" timestamp NOT NULL,
        "verified" boolean NOT NULL DEFAULT false,
        CONSTRAINT "pk_otp_verification" PRIMARY KEY ("id")
      )
    `);

    // Create scheduled_purge_config table
    await queryRunner.query(`
      CREATE TABLE "scheduled_purge_config" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "retention_days" int NOT NULL,
        "enabled" boolean NOT NULL DEFAULT false,
        "cron_expression" varchar(100),
        "last_run_at" timestamp,
        CONSTRAINT "pk_scheduled_purge_config" PRIMARY KEY ("id")
      )
    `);

    // Create indexes for performance
    await queryRunner.query(`
      CREATE INDEX "idx_audit_log_created_at" ON "audit_log"("created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_audit_log_user_action" ON "audit_log"("user_id", "action_type")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_audit_log_module" ON "audit_log"("module")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_export_job_requested_by" ON "export_job"("requested_by")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_export_job_status" ON "export_job"("status")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_otp_verification_email" ON "otp_verification"("email")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_otp_verification_expires_at" ON "otp_verification"("expires_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_otp_verification_expires_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_otp_verification_email"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_export_job_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_export_job_requested_by"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_audit_log_module"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_audit_log_user_action"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_audit_log_created_at"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "scheduled_purge_config"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "otp_verification"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "export_job"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "audit_log"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "export_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "export_format_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "audit_action_type_enum"`);
  }
}
