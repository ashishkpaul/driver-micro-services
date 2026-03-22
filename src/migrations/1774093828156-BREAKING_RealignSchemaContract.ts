import { MigrationInterface, QueryRunner } from "typeorm";

export class BREAKING_RealignSchemaContract1774093828156 implements MigrationInterface {
  name = "BREAKING_RealignSchemaContract1774093828156";

  public async up(queryRunner: QueryRunner): Promise<void> {
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

ALTER TABLE deliveries
DROP COLUMN IF EXISTS seller_order_id;

ALTER TABLE deliveries
RENAME COLUMN seller_order_id_uuid
TO seller_order_id;

END IF;

END $$;
`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
ALTER TABLE deliveries
ADD COLUMN IF NOT EXISTS seller_order_id_uuid UUID
`);
  }
}
