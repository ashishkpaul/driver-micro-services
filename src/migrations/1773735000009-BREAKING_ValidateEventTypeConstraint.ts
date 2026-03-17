import { MigrationInterface, QueryRunner } from "typeorm";

export class BREAKING_ValidateEventTypeConstraint1773735000009 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE outbox
      VALIDATE CONSTRAINT chk_outbox_event_type_valid;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE outbox
      DROP CONSTRAINT IF EXISTS chk_outbox_event_type_valid;
    `);
  }
}
