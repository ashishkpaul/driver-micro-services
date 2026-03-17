import { MigrationInterface, QueryRunner } from "typeorm";

export class DATA_BackfillOutboxIdempotencyKey1773735000003 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE outbox
      SET idempotency_key =
      'BACKFILL_' || id || '_' || EXTRACT(EPOCH FROM created_at)::TEXT
      WHERE idempotency_key IS NULL;
    `);
  }

  public async down(): Promise<void> {
    // No rollback needed for data migration
  }
}
