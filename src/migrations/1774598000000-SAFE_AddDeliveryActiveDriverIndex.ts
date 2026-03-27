import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * INTENT:    Add missing idx_delivery_active_driver index for active delivery queries
 * TYPE:      SAFE
 * RISK:      LOW
 * ROLLBACK:  SAFE
 *
 * CHECKLIST (mark [x] before merging):
 *   [ ] Reviewed generated SQL (not just the TypeScript)
 *   [ ] Uses IF NOT EXISTS / IF EXISTS for idempotency
 *   [ ] New indexes use CONCURRENTLY + transaction = false
 *   [ ] Tested migration:revert locally
 *   [ ] Passes: npm run db:validate
 */
export class SAFE_AddDeliveryActiveDriverIndex1774598000000 implements MigrationInterface {
  name = "SAFE_AddDeliveryActiveDriverIndex1774598000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add missing index for active delivery queries by driver
    // This index was defined in the baseline but not created in the database
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_delivery_active_driver 
      ON deliveries (driver_id, status)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Remove the index on rollback
    await queryRunner.query(`
      DROP INDEX IF EXISTS idx_delivery_active_driver
    `);
  }
}
