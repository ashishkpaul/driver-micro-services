import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * INTENT:
 * Restore missing indexes after UUID normalization.
 *
 * TYPE: FIX
 * RISK: LOW
 * TRANSACTION: DISABLED (CONCURRENTLY)
 */

export class FIX_RealignIndexes1774093828157
implements MigrationInterface {

public transaction=false;

name="FIX_RealignIndexes1774093828157"

public async up(queryRunner: QueryRunner):Promise<void>{

await queryRunner.query(`

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_drivers_city_uuid
ON drivers(city_id)

`);

await queryRunner.query(`

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_drivers_zone_uuid
ON drivers(zone_id)

`);

await queryRunner.query(`

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_deliveries_driver_status
ON deliveries(driver_id,status)

`);

await queryRunner.query(`

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_delivery_events_delivery
ON delivery_events(delivery_id)

`);

}

public async down(queryRunner:QueryRunner):Promise<void>{

await queryRunner.query(`
DROP INDEX CONCURRENTLY IF EXISTS idx_drivers_city_uuid
`);

await queryRunner.query(`
DROP INDEX CONCURRENTLY IF EXISTS idx_drivers_zone_uuid
`);

await queryRunner.query(`
DROP INDEX CONCURRENTLY IF EXISTS idx_deliveries_driver_status
`);

await queryRunner.query(`
DROP INDEX CONCURRENTLY IF EXISTS idx_delivery_events_delivery
`);

}

}