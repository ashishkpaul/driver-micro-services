import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * INTENT:    Allow drivers.name to be NULL so new drivers can be created via OTP
 *            before completing their profile (PROFILE_INCOMPLETE state).
 * TYPE:      SAFE
 * RISK:      LOW
 * ROLLBACK:  SAFE
 */
// MIGRATION_GUARD:ALLOW_DESTRUCTIVE
// @approved-breaking: name nullable is safe — drivers at PROFILE_INCOMPLETE have no name yet
// @allow-mixed-ops: down() backfills nulls before re-adding NOT NULL — intentional rollback pattern

export class FIXMakeDriverNameNullable1776662590120
  implements MigrationInterface
{
  name = "FIXMakeDriverNameNullable1776662590120";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "drivers" ALTER COLUMN "name" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Set a placeholder before re-adding NOT NULL to avoid failures on existing nulls
    await queryRunner.query(
      `UPDATE "drivers" SET "name" = 'Unknown' WHERE "name" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "drivers" ALTER COLUMN "name" SET NOT NULL`,
    );
  }
}
