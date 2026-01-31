import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1718078374611 implements MigrationInterface {
  name = 'InitialSchema1718078374611';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create drivers table
    await queryRunner.query(`
      CREATE TABLE drivers (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(20) UNIQUE NOT NULL,
        is_active BOOLEAN DEFAULT true,
        current_lat DECIMAL(10, 8),
        current_lon DECIMAL(11, 8),
        status VARCHAR(20) DEFAULT 'AVAILABLE',
        vehicle_type VARCHAR(100),
        vehicle_number VARCHAR(100),
        city_id VARCHAR NOT NULL,
        zone_id VARCHAR,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_active_at TIMESTAMP
      )
    `);

    // Create deliveries table
    await queryRunner.query(`
      CREATE TABLE deliveries (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        seller_order_id VARCHAR(255) NOT NULL,
        channel_id VARCHAR(255) NOT NULL,
        driver_id UUID,
        status VARCHAR(20) DEFAULT 'PENDING',
        pickup_lat DECIMAL(10, 8) NOT NULL,
        pickup_lon DECIMAL(11, 8) NOT NULL,
        drop_lat DECIMAL(10, 8) NOT NULL,
        drop_lon DECIMAL(11, 8) NOT NULL,
        pickup_proof_url TEXT,
        delivery_proof_url TEXT,
        failure_code VARCHAR(50),
        failure_reason TEXT,
        assigned_at TIMESTAMP,
        picked_up_at TIMESTAMP,
        delivered_at TIMESTAMP,
        failed_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create delivery_events table
    await queryRunner.query(`
      CREATE TABLE delivery_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        delivery_id UUID NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
        seller_order_id VARCHAR(255) NOT NULL,
        event_type VARCHAR(20) NOT NULL,
        metadata JSONB,
        proof_url TEXT,
        failure_code VARCHAR(50),
        failure_reason TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create assignments table
    await queryRunner.query(`
      CREATE TABLE assignments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        seller_order_id VARCHAR(255) NOT NULL,
        driver_id UUID NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create indexes
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_deliveries_seller_order ON deliveries(seller_order_id);
      CREATE INDEX IF NOT EXISTS idx_deliveries_status ON deliveries(status);
      CREATE INDEX IF NOT EXISTS idx_deliveries_driver ON deliveries(driver_id);
      CREATE INDEX IF NOT EXISTS idx_delivery_events_seller_order ON delivery_events(seller_order_id);
      CREATE INDEX IF NOT EXISTS idx_assignments_seller_driver ON assignments(seller_order_id, driver_id);
      CREATE INDEX IF NOT EXISTS idx_drivers_status ON drivers(status);
      CREATE INDEX IF NOT EXISTS idx_drivers_city_id ON drivers(city_id);
      CREATE INDEX IF NOT EXISTS idx_drivers_zone_id ON drivers(zone_id);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_drivers_status');
    await queryRunner.query('DROP INDEX IF EXISTS idx_assignments_seller_driver');
    await queryRunner.query('DROP INDEX IF EXISTS idx_delivery_events_seller_order');
    await queryRunner.query('DROP INDEX IF EXISTS idx_deliveries_driver');
    await queryRunner.query('DROP INDEX IF EXISTS idx_deliveries_status');
    await queryRunner.query('DROP INDEX IF EXISTS idx_deliveries_seller_order');
    await queryRunner.query('DROP TABLE IF EXISTS assignments');
    await queryRunner.query('DROP TABLE IF EXISTS delivery_events');
    await queryRunner.query('DROP TABLE IF EXISTS deliveries');
    await queryRunner.query('DROP TABLE IF EXISTS drivers');
  }
}