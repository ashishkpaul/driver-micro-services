import { MigrationInterface, QueryRunner } from "typeorm";

export class SAFEAddOutboxIdempotencyKey1773735000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE outbox
      ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR;
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_outbox_idempotency
      ON outbox(idempotency_key)
      WHERE idempotency_key IS NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // await queryRunner.query(`DROP INDEX IF EXISTS idx_outbox_idempotency;`);
    // await queryRunner.query(`ALTER TABLE outbox DROP COLUMN IF EXISTS idempotency_key;`);

    console.log(
      "⚠️  Skipping rollback for SAFE migration - idempotency key preserved",
    );
  }
}
