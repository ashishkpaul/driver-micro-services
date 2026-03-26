import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * INTENT:    Add delivery_metrics table for delivery intelligence projections
 * TYPE:      SAFE
 * RISK:      LOW
 * ROLLBACK:  SAFE
 *
 * This migration creates the delivery_metrics table to track delivery performance metrics
 * for the delivery intelligence system. This is a new table with no breaking changes.
 */

export class SAFEAddDeliveryMetrics1774425100000 implements MigrationInterface {
  name = 'SAFEAddDeliveryMetrics1774425100000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if table already exists
    const tableExists = await queryRunner.hasTable('delivery_metrics');
    if (tableExists) {
      console.log('delivery_metrics table already exists, skipping creation');
      return;
    }

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "delivery_metrics" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "delivery_id" uuid NOT NULL UNIQUE,
        "seller_order_id" varchar NOT NULL,
        "driver_id" uuid,
        "zone_id" uuid,
        "assigned_at" timestamp,
        "picked_up_at" timestamp,
        "delivered_at" timestamp,
        "failed_at" timestamp,
        "assignment_time_seconds" integer DEFAULT 0,
        "pickup_time_seconds" integer DEFAULT 0,
        "in_transit_time_seconds" integer DEFAULT 0,
        "total_time_seconds" integer DEFAULT 0,
        "retry_count" integer DEFAULT 0,
        "reassignment_count" integer DEFAULT 0,
        "sla_breached" boolean DEFAULT false,
        "created_at" timestamp DEFAULT now(),
        "updated_at" timestamp DEFAULT now()
      )
    `);

    // Create indexes for faster lookups
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_delivery_metrics_delivery_id" ON "delivery_metrics" ("delivery_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_delivery_metrics_seller_order_id" ON "delivery_metrics" ("seller_order_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_delivery_metrics_driver_id" ON "delivery_metrics" ("driver_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_delivery_metrics_zone_id" ON "delivery_metrics" ("zone_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Check if table exists before dropping
    const tableExists = await queryRunner.hasTable('delivery_metrics');
    if (!tableExists) {
      console.log('delivery_metrics table does not exist, skipping drop');
      return;
    }

    // Drop indexes first with idempotency
    await queryRunner.query(`DROP INDEX IF EXISTS idx_delivery_metrics_delivery_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_delivery_metrics_seller_order_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_delivery_metrics_driver_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_delivery_metrics_zone_id`);

    await queryRunner.query(`DROP TABLE "delivery_metrics"`);
  }
}