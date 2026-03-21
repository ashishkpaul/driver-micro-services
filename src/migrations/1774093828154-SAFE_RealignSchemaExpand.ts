import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * INTENT:
 * Expand schema for UUID normalization.
 *
 * TYPE: SAFE
 * RISK: LOW
 */

export class SAFE_RealignSchemaExpand1774093828154
implements MigrationInterface {

name='SAFE_RealignSchemaExpand1774093828154'

public async up(queryRunner: QueryRunner): Promise<void>{

await queryRunner.query(`

DO $$

BEGIN

IF EXISTS (
SELECT 1 FROM information_schema.tables
WHERE table_name='deliveries'
)

THEN

ALTER TABLE deliveries
ADD COLUMN IF NOT EXISTS seller_order_id_uuid UUID;

END IF;

END $$;

`);

await queryRunner.query(`

DO $$

BEGIN

IF EXISTS (
SELECT 1 FROM information_schema.tables
WHERE table_name='assignments'
)

THEN

ALTER TABLE assignments
ADD COLUMN IF NOT EXISTS driver_id_uuid UUID;

END IF;

END $$;

`);

await queryRunner.query(`

CREATE INDEX IF NOT EXISTS idx_deliveries_seller_uuid
ON deliveries(seller_order_id_uuid)

`);

await queryRunner.query(`

CREATE INDEX IF NOT EXISTS idx_assignments_driver_uuid
ON assignments(driver_id_uuid)

`);

}

public async down(): Promise<void>{

/*
SAFE rollback intentionally empty.
Required by migration guard.
*/

}

}