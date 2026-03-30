import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * INTENT:    Repair column name drift from old synchronize:true run
 * TYPE:      REPAIR
 * RISK:      LOW
 * ROLLBACK:  SAFE
 *
 * PROBLEM:   Early dev environment ran with synchronize:true before
 *            SnakeNamingStrategy was in place, creating "registrationStatus"
 *            (camelCase) instead of registration_status (snake_case).
 *            The drift engine flags this as a mismatch.
 *
 * SOLUTION:  Rename the camelCase column to snake_case if it exists
 *            and the correct column does not yet exist.
 */
// MIGRATION_GUARD:ALLOW_DESTRUCTIVE

export class FIXRegistrationStatusColumnName1774800000001 implements MigrationInterface {
  name = "FIXRegistrationStatusColumnName1774800000001";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        -- Rename camelCase column left by old synchronize:true run
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'drivers' AND column_name = 'registrationStatus'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'drivers' AND column_name = 'registration_status'
        ) THEN
          ALTER TABLE drivers RENAME COLUMN "registrationStatus" TO registration_status;
        END IF;
      END
      $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'drivers' AND column_name = 'registration_status'
        ) AND NOT EXISTS (
          SELECT 1 FROM information_schema.columns
          WHERE table_name = 'drivers' AND column_name = 'registrationStatus'
        ) THEN
          ALTER TABLE drivers RENAME COLUMN registration_status TO "registrationStatus";
        END IF;
      END
      $$;
    `);
  }
}
