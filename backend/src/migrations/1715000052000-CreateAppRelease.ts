import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Rilis aplikasi native (Android) untuk notifikasi "versi baru tersedia".
 *
 * Satu baris = satu rilis yang dicatat admin. App membandingkan versionCode-nya
 * dengan rilis terbaru; rilis bertanda `force_update` menaikkan versi minimum,
 * sehingga app yang lebih lama wajib memperbarui sebelum bisa dipakai.
 *
 * Nilai enum audit baru dipakai saat admin mencatat/menghapus rilis.
 */
export class CreateAppRelease1715000052000 implements MigrationInterface {
  name = 'CreateAppRelease1715000052000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "app_release" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "platform" varchar(16) NOT NULL DEFAULT 'android',
        "version_code" integer NOT NULL,
        "version_name" varchar(40) NOT NULL,
        "download_url" varchar(500) NOT NULL,
        "release_notes" text,
        "force_update" boolean NOT NULL DEFAULT false,
        "notified_at" timestamptz,
        "created_by" uuid,
        "created_at" timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT "pk_app_release" PRIMARY KEY ("id"),
        CONSTRAINT "uq_app_release_platform_version" UNIQUE ("platform", "version_code"),
        CONSTRAINT "chk_app_release_version_code" CHECK ("version_code" > 0)
      )
    `);
    await queryRunner.query(
      `ALTER TYPE "audit_action_type_enum" ADD VALUE IF NOT EXISTS 'app_release_publish'`,
    );
    await queryRunner.query(
      `ALTER TYPE "audit_action_type_enum" ADD VALUE IF NOT EXISTS 'app_release_delete'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Nilai enum Postgres tidak bisa dihapus tanpa membuat ulang tipe; dibiarkan
    // (tidak berbahaya — hanya tak terpakai).
    await queryRunner.query(`DROP TABLE IF EXISTS "app_release"`);
  }
}
