import { MigrationInterface, QueryRunner } from "typeorm";

export class SAFEAddOutboxTable1773729157505 implements MigrationInterface {
  name = "SAFEAddOutboxTable1773729157505";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create outbox table for domain events
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS outbox (
        id SERIAL PRIMARY KEY,
        event_type varchar NOT NULL,
        payload jsonb NOT NULL,
        status varchar NOT NULL,
        created_at TIMESTAMP DEFAULT now(),
        processed_at TIMESTAMP
      )
    `);

    // Create driver_offers table
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS driver_offers (
        id uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
        delivery_id uuid NOT NULL,
        driver_id uuid NOT NULL,
        status varchar(20) DEFAULT 'PENDING',
        offer_payload jsonb NOT NULL,
        created_at TIMESTAMP DEFAULT now(),
        expires_at TIMESTAMP NOT NULL
      )
    `);

    // Create indexes for driver_offers
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_delivery_pending ON driver_offers (delivery_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_driver_pending ON driver_offers (driver_id)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_expires_at ON driver_offers (expires_at)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query(`DROP INDEX IF EXISTS idx_expires_at`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_driver_pending`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_delivery_pending`);
    
    // Drop tables
    await queryRunner.query(`DROP TABLE IF EXISTS driver_offers`);
    await queryRunner.query(`DROP TABLE IF EXISTS outbox`);
  }
}