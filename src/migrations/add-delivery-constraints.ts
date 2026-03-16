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

    // Create index for offer queries
    await queryRunner.query(`
      CREATE INDEX idx_offer_delivery_status
      ON driver_offers(delivery_id, status)
    `);

    // Add check constraint to ensure only one active delivery per driver
    await queryRunner.query(`
      ALTER TABLE deliveries
      ADD CONSTRAINT chk_delivery_unique_active_per_driver
      EXCLUDE USING GIST (
        driver_id WITH =,
        status WITH &&
        (SELECT ARRAY['ASSIGNED', 'PICKED_UP']::text[])
      )
      WHERE (status IN ('ASSIGNED', 'PICKED_UP'))
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
