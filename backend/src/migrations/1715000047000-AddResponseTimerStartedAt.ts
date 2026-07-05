import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Timer "batas waktu pengisian" (maxDuration) yang sadar jeda/lanjut.
 *
 * Sebelumnya isTimerExpired dihitung dari `started_at` yang dicap SEKALI saat
 * draft pertama tersimpan dan tak pernah di-reset — sehingga responden yang
 * menjeda lalu melanjutkan bisa ditolak "waktu habis" walau timer di layar
 * (yang reset tiap buka halaman) masih menunjukkan sisa waktu. Bug ini membuat
 * jawaban yang sudah tersimpan tak bisa dikirim final.
 *
 * Kolom baru `timer_started_at` dipakai KHUSUS untuk timer maxDuration dan
 * di-reset ke sekarang setiap responden melanjutkan (perilaku "reset per sesi").
 * `started_at` sengaja TIDAK diutak-atik agar tetap valid untuk analitik durasi
 * dan pemeriksaan anti-bot (minimum completion time).
 *
 * Backfill: isi dengan `started_at` untuk baris lama agar tak ada NULL tak
 * terduga; draft lama yang "macet" akan otomatis pulih saat dibuka lagi karena
 * getRespondentResponse me-reset kolom ini ke NOW() pada resume.
 */
export class AddResponseTimerStartedAt1715000047000 implements MigrationInterface {
  name = 'AddResponseTimerStartedAt1715000047000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "survey_response" ADD COLUMN IF NOT EXISTS "timer_started_at" timestamp`,
    );
    await queryRunner.query(
      `UPDATE "survey_response" SET "timer_started_at" = "started_at" WHERE "timer_started_at" IS NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "survey_response" DROP COLUMN IF EXISTS "timer_started_at"`,
    );
  }
}
