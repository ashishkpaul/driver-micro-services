import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * INTENT:    Make phone and city_id columns nullable in drivers table
 * TYPE:      SAFE
 * RISK:      LOW
 * ROLLBACK:  SAFE
 * *
 * CHECKLIST (mark [x] before merging):
 *   [ ] Reviewed generated SQL (not just the TypeScript)
 *   [ ] Uses IF NOT EXISTS / IF EXISTS for idempotency
 *   [ ] New indexes use CONCURRENTLY + transaction = false
 *   [ ] Tested migration:revert locally
 *   [ ] Passes: npm run db:validate
 */
// @allow-mixed-ops: Required to make columns nullable for OTP flow

export class SAFEMakeDriverPhoneAndCityNullable1774773500000 implements MigrationInterface {
  name = "SAFEMakeDriverPhoneAndCityNullable1774773500000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Make phone column nullable
    await queryRunner.query(
      `ALTER TABLE "drivers" ALTER COLUMN "phone" DROP NOT NULL`,
    );

    // Make city_id column nullable
    await queryRunner.query(
      `ALTER TABLE "drivers" ALTER COLUMN "city_id" DROP NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Restore phone NOT NULL constraint
    await queryRunner.query(
      `ALTER TABLE "drivers" ALTER COLUMN "phone" SET NOT NULL`,
    );

    // Restore city_id NOT NULL constraint
    await queryRunner.query(
      `ALTER TABLE "drivers" ALTER COLUMN "city_id" SET NOT NULL`,
    );
  }
}
