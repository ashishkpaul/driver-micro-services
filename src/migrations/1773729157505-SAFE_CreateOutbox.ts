import { MigrationInterface, QueryRunner } from "typeorm";

export class SAFEAddOutboxTable1773729157505 implements MigrationInterface {
  name = "SAFEAddOutboxTable1773729157505";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create outbox table for domain events
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS outbox (
        id SERIAL PRIMARY KEY,
        event_type varchar NOT NULL,
        payload jsonb NOT NULL,
        status varchar NOT NULL,
        retry_count int DEFAULT 0,
        last_error text,
        next_retry_at timestamp,
        created_at TIMESTAMP DEFAULT now(),
        processed_at TIMESTAMP
      )
    `);

    // Create index for outbox worker queries
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_outbox_status_created
      ON outbox(status, created_at)
    `);
  }

  public async down(): Promise<void> {
    // SAFE migrations typically don't rollback in production
    // If rollback is absolutely necessary, the DROP statements would be:
    // await queryRunner.query(`DROP INDEX IF EXISTS idx_outbox_status_created`);
    // await queryRunner.query(`DROP TABLE IF EXISTS outbox`);

    console.log(
      "⚠️  Skipping rollback for SAFE migration - outbox table preserved",
    );
  }
}
