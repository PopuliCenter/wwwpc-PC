import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUsersAndProfile1715000001000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enable uuid-ossp extension
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // Create enum types
    await queryRunner.query(`
      CREATE TYPE "user_role_enum" AS ENUM (
        'super_admin', 'admin', 'analyst', 'viewer', 'respondent'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "user_status_enum" AS ENUM (
        'active', 'inactive', 'pending'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "gender_enum" AS ENUM (
        'male', 'female', 'other'
      )
    `);

    // Create users table
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "email" varchar(255) NOT NULL,
        "phone" varchar(20) NOT NULL,
        "password_hash" varchar(255) NOT NULL,
        "full_name" varchar(255) NOT NULL,
        "role" "user_role_enum" NOT NULL DEFAULT 'respondent',
        "status" "user_status_enum" NOT NULL DEFAULT 'pending',
        "email_verified" boolean NOT NULL DEFAULT false,
        "profile_completed" boolean NOT NULL DEFAULT false,
        "created_at" timestamp NOT NULL DEFAULT NOW(),
        "updated_at" timestamp NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_users" PRIMARY KEY ("id"),
        CONSTRAINT "uq_user_email" UNIQUE ("email"),
        CONSTRAINT "uq_user_phone" UNIQUE ("phone")
      )
    `);

    // Create user_profile table
    await queryRunner.query(`
      CREATE TABLE "user_profile" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "age" int,
        "gender" "gender_enum",
        "occupation" varchar(255),
        "city" varchar(255),
        "province" varchar(255),
        "created_at" timestamp NOT NULL DEFAULT NOW(),
        "updated_at" timestamp NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_user_profile" PRIMARY KEY ("id"),
        CONSTRAINT "fk_user_profile_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "uq_user_profile_user_id" UNIQUE ("user_id")
      )
    `);

    // Create indexes for performance
    await queryRunner.query(`
      CREATE INDEX "idx_users_role" ON "users"("role")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_users_status" ON "users"("status")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_users_created_at" ON "users"("created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_user_profile_user_id" ON "user_profile"("user_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_user_profile_user_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_users_created_at"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_users_status"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_users_role"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "user_profile"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "users"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "gender_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "user_status_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "user_role_enum"`);
    await queryRunner.query(`DROP EXTENSION IF EXISTS "uuid-ossp"`);
  }
}
