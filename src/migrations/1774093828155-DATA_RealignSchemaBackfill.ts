import { MigrationInterface, QueryRunner } from "typeorm";

export class DATA_RealignSchemaBackfill1774093828155 implements MigrationInterface {
  name = "DATA_RealignSchemaBackfill1774093828155";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
CREATE EXTENSION IF NOT EXISTS pgcrypto
`);

    await queryRunner.query(`

DO $$

BEGIN

IF EXISTS (
SELECT 1
FROM information_schema.columns
WHERE table_name='deliveries'
AND column_name='seller_order_id_uuid'
)

THEN

UPDATE deliveries
SET seller_order_id_uuid =
CASE

WHEN seller_order_id ~ '^[0-9a-fA-F-]{36}$'
THEN seller_order_id::uuid

ELSE gen_random_uuid()

END

WHERE seller_order_id_uuid IS NULL;

END IF;

END $$;

`);

    await queryRunner.query(`

DO $$

BEGIN

IF EXISTS (
SELECT 1
FROM information_schema.columns
WHERE table_name='assignments'
AND column_name='driver_id_uuid'
)

THEN

UPDATE assignments
SET driver_id_uuid =
CASE

WHEN driver_id ~ '^[0-9a-fA-F-]{36}$'
THEN driver_id::uuid

ELSE gen_random_uuid()

END

WHERE driver_id_uuid IS NULL;

END IF;

END $$;

`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`

UPDATE deliveries
SET seller_order_id_uuid=NULL

`);

    await queryRunner.query(`

UPDATE assignments
SET driver_id_uuid=NULL

`);
  }
}
