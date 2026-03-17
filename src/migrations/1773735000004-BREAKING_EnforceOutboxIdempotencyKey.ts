import { MigrationInterface, QueryRunner } from "typeorm";

export class BREAKING_EnforceOutboxIdempotencyKey1773735000004 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE outbox
      ALTER COLUMN idempotency_key SET NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE outbox
      ALTER COLUMN idempotency_key DROP NOT NULL;
    `);
  }
}
