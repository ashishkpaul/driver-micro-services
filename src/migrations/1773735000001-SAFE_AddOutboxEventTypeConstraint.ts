import { MigrationInterface, QueryRunner } from "typeorm";

export class SAFEAddOutboxEventTypeConstraint1773735000001 implements MigrationInterface {
  name = "SAFEAddOutboxEventTypeConstraint1773735000001";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add check constraint for valid values (NOT VALID for safety)
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

    console.log("✅ Added event_type constraint (NOT VALID)");
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE outbox
      DROP CONSTRAINT IF EXISTS chk_outbox_event_type_valid;
    `);
  }
}
