import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * INTENT:   Change drivers.city_id and drivers.zone_id from VARCHAR to UUID
 *           to match the type used by cities.id and zones.id
 * TYPE:     BREAKING
 * RISK:     HIGH
 * ROLLBACK: SAFE
 *
 * DESCRIPTION:
 *   The baseline created drivers.city_id as VARCHAR NOT NULL and
 *   drivers.zone_id as VARCHAR (nullable). The cities and zones tables use
 *   UUID primary keys. Mismatched types prevent optimal index usage on joins,
 *   and block adding a proper FK constraint to cities in the future.
 *   city_id and zone_id are currently logical references (no FK enforced at
 *   the DB level because drivers are cross-service), but the type should still
 *   match so that casts don't silently degrade query plans.
 *
 * EXPAND → MIGRATE → CONTRACT: standalone (no backfill needed — cast is lossless)
 *
 * DEPLOY NOTES:
 *   - Can run online: yes on an empty drivers table; causes brief lock on
 *     non-empty tables proportional to row count (PostgreSQL rewrites the heap).
 *     For large tables, use SAFE_ ADD + DATA_ backfill + BREAKING_ SET NOT NULL.
 *     Acceptable here because drivers table is empty at time of deployment.
 *   - Estimated lock duration: subsecond on empty table
 *   - Depends on: SAFE_FixDuplicateDeliveryPendingIndex must have run first
 *
 * ROLLBACK PLAN:
 *   down() changes both columns back to VARCHAR. No data lost because UUID and
 *   VARCHAR are losslessly round-trippable for well-formed UUID values.
 *
 * @approved-breaking: Schema fix on empty table — no driver rows exist at deploy time.
 *   Changing VARCHAR→UUID is a lossless cast. Reviewed and confirmed safe.
 *
 * CHECKLIST:
 *   [x] @approved-breaking annotation filled in
 *   [x] Verified drivers table is empty at time of first deployment
 *   [x] Tested migration:revert
 *   [x] Passes db:validate locally
 */

export class BREAKING_FixDriversCityZoneUUID1753920001000 implements MigrationInterface {
  name = 'BREAKING_FixDriversCityZoneUUID1753920001000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // city_id: VARCHAR NOT NULL → UUID NOT NULL
    // The USING clause tells PostgreSQL how to cast existing values.
    // city_id::uuid fails fast if any row contains a non-UUID string — which
    // is exactly the safety we want (corrupt data is surfaced, not silently truncated).
    await queryRunner.query(`
      ALTER TABLE drivers
        ALTER COLUMN city_id TYPE UUID USING city_id::uuid
    `);

    // zone_id: VARCHAR → UUID (nullable, no USING needed for NULL values)
    await queryRunner.query(`
      ALTER TABLE drivers
        ALTER COLUMN zone_id TYPE UUID USING zone_id::uuid
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert to original VARCHAR type (lossless — UUID text representation preserved)
    await queryRunner.query(`
      ALTER TABLE drivers
        ALTER COLUMN city_id TYPE VARCHAR USING city_id::text
    `);

    await queryRunner.query(`
      ALTER TABLE drivers
        ALTER COLUMN zone_id TYPE VARCHAR USING zone_id::text
    `);
  }
}
