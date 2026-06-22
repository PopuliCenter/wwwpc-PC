import { MigrationInterface, QueryRunner } from 'typeorm';

/** Kolom avatar_url pada users (foto Google / avatar pilihan; null = pakai inisial). */
export class AddUserAvatarUrl1715000041000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "avatar_url" varchar(500)`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "avatar_url"`);
  }
}
