import { MigrationInterface, QueryRunner } from "typeorm";

export class SAFEAddEventTypeConstraint1773735000008 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 
          FROM pg_constraint 
          WHERE conname = 'chk_outbox_event_type_valid'
        ) THEN
          ALTER TABLE outbox
          ADD CONSTRAINT chk_outbox_event_type_valid
          CHECK (event_type IN ('DELIVERY_ASSIGNED'))
          NOT VALID;
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE outbox
      DROP CONSTRAINT IF EXISTS chk_outbox_event_type_valid;
    `);
  }
}
