import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Index parsial pada survey_response.destination_number untuk mempercepat
 * agregasi deteksi duplikat nomor tujuan reward (GROUP BY/HAVING).
 */
export class AddResponseDestinationNumberIndex1715000023000
  implements MigrationInterface
{
  name = 'AddResponseDestinationNumberIndex1715000023000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_survey_response_destination_number"
        ON "survey_response" ("destination_number")
        WHERE "destination_number" IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_survey_response_destination_number"`,
    );
  }
}
