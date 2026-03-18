import { MigrationInterface, QueryRunner } from "typeorm";

export class SAFEAddEventVersion1773735000003 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add the version column as nullable first
    await queryRunner.query(`
      ALTER TABLE outbox 
      ADD COLUMN IF NOT EXISTS version INTEGER DEFAULT 1
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // await queryRunner.query(`ALTER TABLE outbox DROP COLUMN IF EXISTS version`);

    console.log(
      "⚠️  Skipping rollback for SAFE migration - event version column preserved",
    );
  }
}
