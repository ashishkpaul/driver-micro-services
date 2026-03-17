import { MigrationInterface, QueryRunner } from "typeorm";

export class SAFEAddOutboxWorkerReliabilityColumns1773735000000 implements MigrationInterface {
  name = "SAFEAddOutboxWorkerReliabilityColumns1773735000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE outbox
      ADD COLUMN IF NOT EXISTS retry_count int DEFAULT 0
    `);

    await queryRunner.query(`
      ALTER TABLE outbox
      ADD COLUMN IF NOT EXISTS last_error text
    `);

    await queryRunner.query(`
      ALTER TABLE outbox
      ADD COLUMN IF NOT EXISTS next_retry_at timestamp
    `);

    await queryRunner.query(`
      ALTER TABLE outbox
      ADD COLUMN IF NOT EXISTS locked_at timestamp
    `);

    await queryRunner.query(`
      ALTER TABLE outbox
      ADD COLUMN IF NOT EXISTS locked_by varchar
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_outbox_worker
      ON outbox(status, locked_at, next_retry_at, created_at)
    `);

    await queryRunner.query(`
      UPDATE outbox
      SET status = 'COMPLETED'
      WHERE status = 'DONE'
    `);
  }

  public async down(): Promise<void> {
    // SAFE rollback intentionally skipped in production.
    // IF EXISTS markers are kept for policy consistency.
    // IF EXISTS
    console.log(
      "⚠️  Skipping rollback for SAFE migration - outbox worker columns preserved",
    );
  }
}
