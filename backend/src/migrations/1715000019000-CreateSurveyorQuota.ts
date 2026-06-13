import { MigrationInterface, QueryRunner } from 'typeorm';

/** Tabel penugasan surveyor (TPD) per survei: kuota + nomor kuesioner ter-assign. */
export class CreateSurveyorQuota1715000019000 implements MigrationInterface {
  name = 'CreateSurveyorQuota1715000019000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "surveyor_quota" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "survey_id" uuid NOT NULL,
        "surveyor_id" uuid NOT NULL,
        "quota" integer,
        "assigned_numbers" jsonb NOT NULL DEFAULT '[]',
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "pk_surveyor_quota" PRIMARY KEY ("id"),
        CONSTRAINT "fk_surveyor_quota_survey" FOREIGN KEY ("survey_id")
          REFERENCES "survey"("id") ON DELETE CASCADE,
        CONSTRAINT "fk_surveyor_quota_surveyor" FOREIGN KEY ("surveyor_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "uq_surveyor_quota_survey_surveyor" UNIQUE ("survey_id", "surveyor_id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_surveyor_quota_surveyor" ON "surveyor_quota" ("surveyor_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "surveyor_quota"`);
  }
}
