import { MigrationInterface, QueryRunner } from "typeorm";

export class DATA_BackfillEventVersion1773735000006 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE outbox
      SET version = 1
      WHERE version IS NULL;
    `);
  }

  public async down(): Promise<void> {
    // No rollback needed for data migration
  }
}
