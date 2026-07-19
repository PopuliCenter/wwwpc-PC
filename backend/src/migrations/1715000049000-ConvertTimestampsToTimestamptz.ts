import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Perbaikan zona waktu: konversi SEMUA kolom `timestamp without time zone` →
 * `timestamptz` (timestamp with time zone).
 *
 * MASALAH yang diperbaiki: kolom lama bertipe `timestamp` (tanpa zona). Container
 * Postgres berjalan di UTC, tetapi proses backend di Asia/Jakarta. Akibatnya
 * driver membaca nilai naive sebagai waktu LOKAL (WIB) padahal disimpan sebagai
 * wall-clock UTC → riwayat/timestamp yang tampil ke pengguna MELESET +7 jam.
 *
 * SOLUSI: `timestamptz` menyimpan instant absolut, kebal terhadap TZ proses/DB.
 *
 * KONVERSI DATA LAMA: nilai naive yang tersimpan adalah wall-clock UTC (karena
 * NOW() & bind Date ditulis di bawah sesi Postgres UTC). Maka `col AT TIME ZONE
 * 'UTC'` menafsirkannya sebagai UTC → menghasilkan instant yang BENAR. Setelah
 * ini, waktu tampil selaras dengan WIB di perangkat pengguna.
 *
 * CATATAN: ALTER TYPE menulis ulang tabel (mengunci sebentar). Untuk data survei
 * skala saat ini prosesnya cepat. Kolom `date`/`time`/`timestamptz` TIDAK tersentuh.
 */
export class ConvertTimestampsToTimestamptz1715000049000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      DECLARE r RECORD;
      BEGIN
        FOR r IN
          SELECT c.table_name, c.column_name
          FROM information_schema.columns c
          JOIN information_schema.tables t
            ON t.table_schema = c.table_schema AND t.table_name = c.table_name
          WHERE c.table_schema = 'public'
            AND t.table_type = 'BASE TABLE'
            AND c.data_type = 'timestamp without time zone'
        LOOP
          EXECUTE format(
            'ALTER TABLE %I ALTER COLUMN %I TYPE timestamptz USING %I AT TIME ZONE ''UTC''',
            r.table_name, r.column_name, r.column_name
          );
        END LOOP;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Kembalikan ke `timestamp` tanpa zona (wall-clock UTC), kebalikan dari up().
    await queryRunner.query(`
      DO $$
      DECLARE r RECORD;
      BEGIN
        FOR r IN
          SELECT c.table_name, c.column_name
          FROM information_schema.columns c
          JOIN information_schema.tables t
            ON t.table_schema = c.table_schema AND t.table_name = c.table_name
          WHERE c.table_schema = 'public'
            AND t.table_type = 'BASE TABLE'
            AND c.data_type = 'timestamp with time zone'
        LOOP
          EXECUTE format(
            'ALTER TABLE %I ALTER COLUMN %I TYPE timestamp USING %I AT TIME ZONE ''UTC''',
            r.table_name, r.column_name, r.column_name
          );
        END LOOP;
      END $$;
    `);
  }
}
