import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRewardAndRedemption1715000005 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enum types for reward module
    await queryRunner.query(`
      CREATE TYPE "transaction_type_enum" AS ENUM (
        'credit', 'debit'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "point_credit_reason_enum" AS ENUM (
        'registration', 'profile_completion', 'survey_completion',
        'streak_bonus', 'manual_credit'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "redemption_status_enum" AS ENUM (
        'pending', 'processing', 'completed', 'failed'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "manual_reward_status_enum" AS ENUM (
        'pending', 'distributed'
      )
    `);

    // Create point_transaction table
    await queryRunner.query(`
      CREATE TABLE "point_transaction" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "amount" int NOT NULL,
        "transaction_type" "transaction_type_enum" NOT NULL,
        "reason" "point_credit_reason_enum" NOT NULL,
        "reference_id" uuid,
        "earned_at" timestamp NOT NULL DEFAULT NOW(),
        "expires_at" timestamp,
        "expired" boolean NOT NULL DEFAULT false,
        CONSTRAINT "pk_point_transaction" PRIMARY KEY ("id"),
        CONSTRAINT "fk_point_transaction_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    // Create reward_redemption table
    await queryRunner.query(`
      CREATE TABLE "reward_redemption" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "reward_type" varchar(255) NOT NULL,
        "points_spent" int NOT NULL,
        "destination_number" varchar(50),
        "status" "redemption_status_enum" NOT NULL DEFAULT 'pending',
        "requested_at" timestamp NOT NULL DEFAULT NOW(),
        "processed_at" timestamp,
        "otp_code" varchar(10),
        "otp_expires_at" timestamp,
        CONSTRAINT "pk_reward_redemption" PRIMARY KEY ("id"),
        CONSTRAINT "fk_reward_redemption_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    // Create streak_tracker table
    await queryRunner.query(`
      CREATE TABLE "streak_tracker" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "current_streak_days" int NOT NULL DEFAULT 0,
        "last_completion_date" date,
        "current_multiplier" decimal(3, 1) NOT NULL DEFAULT 1.0,
        CONSTRAINT "pk_streak_tracker" PRIMARY KEY ("id"),
        CONSTRAINT "fk_streak_tracker_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "uq_streak_tracker_user_id" UNIQUE ("user_id")
      )
    `);

    // Create manual_reward_distribution table
    await queryRunner.query(`
      CREATE TABLE "manual_reward_distribution" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "survey_id" uuid NOT NULL,
        "respondent_id" uuid NOT NULL,
        "destination_number" varchar(50),
        "status" "manual_reward_status_enum" NOT NULL DEFAULT 'pending',
        "distributed_at" timestamp,
        "distributed_by" uuid,
        CONSTRAINT "pk_manual_reward_distribution" PRIMARY KEY ("id"),
        CONSTRAINT "fk_manual_reward_dist_survey" FOREIGN KEY ("survey_id")
          REFERENCES "survey"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_manual_reward_dist_respondent" FOREIGN KEY ("respondent_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_manual_reward_dist_distributed_by" FOREIGN KEY ("distributed_by")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    // Create indexes for performance
    await queryRunner.query(`
      CREATE INDEX "idx_point_transaction_user_id" ON "point_transaction"("user_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_point_transaction_user_expires" ON "point_transaction"("user_id", "expires_at") WHERE NOT "expired"
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_point_transaction_earned_at" ON "point_transaction"("earned_at")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_reward_redemption_user_id" ON "reward_redemption"("user_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_reward_redemption_status" ON "reward_redemption"("status")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_manual_reward_dist_survey_id" ON "manual_reward_distribution"("survey_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_manual_reward_dist_respondent_id" ON "manual_reward_distribution"("respondent_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_manual_reward_dist_respondent_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_manual_reward_dist_survey_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_reward_redemption_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_reward_redemption_user_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_point_transaction_earned_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_point_transaction_user_expires"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_point_transaction_user_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "manual_reward_distribution"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "streak_tracker"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "reward_redemption"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "point_transaction"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "manual_reward_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "redemption_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "point_credit_reason_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "transaction_type_enum"`);
  }
}
