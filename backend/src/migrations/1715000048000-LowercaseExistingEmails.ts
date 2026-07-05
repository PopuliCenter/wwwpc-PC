import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Normalisasi email lama menjadi huruf kecil (H3). Semua DTO kini men-trim +
 * lowercase email saat masuk; migrasi ini menyelaraskan data yang sudah ada
 * agar login/reset/pencarian konsisten (kolom email unik & case-sensitive).
 *
 * AMAN terhadap tabrakan: hanya baris yang TIDAK akan bentrok yang di-lowercase.
 * Bila ada dua akun berbeda hanya karena beda huruf besar-kecil (mis.
 * "Budi@x.com" & "budi@x.com"), keduanya dibiarkan agar migrasi tak gagal —
 * duplikat semacam itu perlu ditinjau manual (jarang terjadi).
 */
export class LowercaseExistingEmails1715000048000 implements MigrationInterface {
  name = 'LowercaseExistingEmails1715000048000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "users" u
      SET email = LOWER(email)
      WHERE email <> LOWER(email)
        AND NOT EXISTS (
          SELECT 1 FROM "users" u2
          WHERE u2.id <> u.id AND LOWER(u2.email) = LOWER(u.email)
        )
    `);
  }

  public async down(): Promise<void> {
    // Tidak dapat dikembalikan (huruf asli tak disimpan). No-op.
  }
}
