import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * INTENT:    Add driver_stats table for delivery intelligence projections
 * TYPE:      SAFE
 * RISK:      LOW
 * ROLLBACK:  SAFE
 *
 * This migration creates the driver_stats table to track driver performance metrics
 * for the delivery intelligence system. This is a new table with no breaking changes.
 */

export class SAFEAddDriverStats1774425000000 implements MigrationInterface {
  name = 'SAFEAddDriverStats1774425000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Check if table already exists
    const tableExists = await queryRunner.hasTable('driver_stats');
    if (tableExists) {
      console.log('driver_stats table already exists, skipping creation');
      return;
    }

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "driver_stats" (
        "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        "driver_id" uuid NOT NULL UNIQUE,
        "total_deliveries" integer DEFAULT 0,
        "completed_deliveries" integer DEFAULT 0,
        "failed_deliveries" integer DEFAULT 0,
        "cancelled_deliveries" integer DEFAULT 0,
        "acceptance_count" integer DEFAULT 0,
        "rejection_count" integer DEFAULT 0,
        "avg_delivery_time_seconds" integer DEFAULT 0,
        "avg_pickup_time_seconds" integer DEFAULT 0,
        "last_delivery_at" timestamp,
        "reliability_score" numeric DEFAULT 0,
        "created_at" timestamp DEFAULT now(),
        "updated_at" timestamp DEFAULT now()
      )
    `);

    // Create index on driver_id for faster lookups
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "idx_driver_stats_driver_id" ON "driver_stats" ("driver_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Check if table exists before dropping
    const tableExists = await queryRunner.hasTable('driver_stats');
    if (!tableExists) {
      console.log('driver_stats table does not exist, skipping drop');
      return;
    }

    // Drop index first with idempotency
    await queryRunner.query(`DROP INDEX IF EXISTS idx_driver_stats_driver_id`);

    await queryRunner.query(`DROP TABLE "driver_stats"`);
  }
}