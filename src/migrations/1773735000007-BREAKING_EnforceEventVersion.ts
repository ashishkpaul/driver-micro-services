import { MigrationInterface, QueryRunner } from "typeorm";

export class BREAKING_EnforceEventVersion1773735000007 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE outbox
      ALTER COLUMN version SET NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE outbox
      ALTER COLUMN version DROP NOT NULL;
    `);
  }
}
