import { MigrationInterface, QueryRunner } from "typeorm";

export class SAFEAddWorkerLockingColumns1773735000005 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE outbox
      ADD COLUMN IF NOT EXISTS locked_by VARCHAR;
    `);

    await queryRunner.query(`
      ALTER TABLE outbox
      ADD COLUMN IF NOT EXISTS locked_at timestamptz;
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_outbox_locked
      ON outbox(status, locked_at);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // await queryRunner.query(`DROP INDEX IF EXISTS idx_outbox_locked;`);
    // await queryRunner.query(`ALTER TABLE outbox DROP COLUMN IF EXISTS locked_by;`);
    // await queryRunner.query(`ALTER TABLE outbox DROP COLUMN IF EXISTS locked_at;`);

    console.log(
      "⚠️  Skipping rollback for SAFE migration - outbox locking columns preserved",
    );
  }
}
