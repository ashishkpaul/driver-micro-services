import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDeliveryConstraints1773636896561 implements MigrationInterface {
  name = "AddDeliveryConstraints1773636896561";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create unique index to prevent multiple active deliveries per driver
    await queryRunner.query(`
      CREATE UNIQUE INDEX idx_delivery_active_driver
      ON deliveries(driver_id)
      WHERE status IN ('ASSIGNED', 'PICKED_UP')
    `);

    // Create index for offer queries (defensive - only if table exists)
    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_name = 'driver_offers'
        ) THEN
          CREATE INDEX IF NOT EXISTS idx_offer_delivery_status
          ON driver_offers(delivery_id, status);
        END IF;
      END $$;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query("DROP INDEX IF EXISTS idx_delivery_active_driver");
    await queryRunner.query("DROP INDEX IF EXISTS idx_offer_delivery_status");
    await queryRunner.query(
      "ALTER TABLE deliveries DROP CONSTRAINT IF EXISTS chk_delivery_unique_active_per_driver",
    );
  }
}
