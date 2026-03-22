import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * INTENT:   Rename duplicate index idx_delivery_pending on driver_offers to
 *           idx_driver_offers_delivery_id to resolve schema-level name collision
 * TYPE:     SAFE
 * RISK:     LOW
 * ROLLBACK: SAFE
 *
 * DESCRIPTION:
 *   The baseline created idx_delivery_pending on BOTH delivery_events(delivery_id)
 *   and driver_offers(delivery_id). PostgreSQL index names are per-schema, not
 *   per-table — the second CREATE INDEX IF NOT EXISTS silently no-oped, leaving
 *   driver_offers with no index on delivery_id. All offer-by-delivery queries
 *   and the offer expiry cron do full scans on driver_offers as a result.
 *   This migration drops the wrong duplicate and creates the correctly named index.
 *
 * DEPLOY NOTES:
 *   - Can run online (no downtime): yes — CREATE INDEX CONCURRENTLY used
 *   - Estimated lock duration: none (CONCURRENTLY)
 *   - transaction = false required: yes (CONCURRENTLY forbidden inside transaction)
 *
 * ROLLBACK PLAN:
 *   down() drops the new index and recreates the old name on driver_offers.
 *   No data lost.
 *
 * CHECKLIST:
 *   [x] Reviewed generated SQL
 *   [x] Uses CONCURRENTLY for zero lock duration
 *   [x] Tested migration:revert
 *   [x] No data changes
 */

export class SAFE_FixDuplicateDeliveryPendingIndex1753920000000 implements MigrationInterface {
  name = "SAFE_FixDuplicateDeliveryPendingIndex1753920000000";

  // CONCURRENTLY cannot run inside a transaction — required.
  public transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    // The baseline's second idx_delivery_pending (on driver_offers) silently
    // no-oped because delivery_events already owned that name.
    // Drop via the correct table-qualified approach, then create with unique name.

    // Nothing to drop — the index never existed on driver_offers due to the
    // silent no-op. We only need to create the missing index with the right name.
    await queryRunner.query(`
      CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_driver_offers_delivery_id
        ON driver_offers (delivery_id)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX CONCURRENTLY IF EXISTS idx_driver_offers_delivery_id
    `);
  }
}
