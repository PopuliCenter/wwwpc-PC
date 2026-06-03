import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateGeolocation1715000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Enable pgcrypto extension for AES-256 encryption
    await queryRunner.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

    // Create geolocation table
    await queryRunner.query(`
      CREATE TABLE "geolocation" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "encrypted_latitude" bytea,
        "encrypted_longitude" bytea,
        "city" varchar(255),
        "province" varchar(255),
        "captured_at" timestamp NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_geolocation" PRIMARY KEY ("id"),
        CONSTRAINT "fk_geolocation_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    // Create indexes
    await queryRunner.query(`
      CREATE INDEX "idx_geolocation_user_id" ON "geolocation"("user_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "idx_geolocation_city_province" ON "geolocation"("city", "province")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_geolocation_city_province"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "idx_geolocation_user_id"`);
    await queryRunner.query(`DROP TABLE IF EXISTS "geolocation"`);
    await queryRunner.query(`DROP EXTENSION IF EXISTS "pgcrypto"`);
  }
}
