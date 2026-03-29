// MIGRATION_GUARD:ALLOW_DESTRUCTIVE
import { MigrationInterface, QueryRunner } from "typeorm";

export class SyncDriverRegistrationExpand1774762625054 implements MigrationInterface {
  name = "SyncDriverRegistrationExpand1774762625054";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop old indexes
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."idx_backfill_jobs_status"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."idx_backfill_jobs_table_name"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."idx_backfill_jobs_created_at"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."idx_delivery_active_driver"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."idx_driver_stats_driver_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."idx_delivery_metrics_delivery_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."idx_delivery_metrics_seller_order_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."idx_delivery_metrics_driver_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."idx_delivery_metrics_zone_id"`,
    );

    // Create schema_differences table
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "schema_differences" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "table" character varying(255) NOT NULL, "column" character varying(255), "index" character varying(255), "constraint" character varying(255), "type" character varying(50) NOT NULL, "severity" character varying(20) NOT NULL, "description" text NOT NULL, "entity" jsonb, "database" jsonb, "status" character varying(50) NOT NULL, "readiness" character varying(50) NOT NULL DEFAULT 'PENDING', "validation_status" character varying(50) NOT NULL DEFAULT 'PENDING', "suggested_action" text, "backfill_sql" text, "backfill_job_id" uuid, "migration_name" character varying, "detected_at" TIMESTAMP, "backfill_scheduled_at" TIMESTAMP, "backfill_started_at" TIMESTAMP, "backfill_completed_at" TIMESTAMP, "ready_for_migration_at" TIMESTAMP, "migrated_at" TIMESTAMP, "error_message" text, "metadata" jsonb NOT NULL DEFAULT '{}', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_037b9161f5a14ffaf5d32472251" PRIMARY KEY ("id"))`,
    );

    // Add new columns
    await queryRunner.query(
      `ALTER TABLE "outbox" ADD IF NOT EXISTS "updated_at" TIMESTAMP DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "drivers" ADD IF NOT EXISTS "last_lat" numeric(10,8)`,
    );
    await queryRunner.query(
      `ALTER TABLE "drivers" ADD IF NOT EXISTS "last_lon" numeric(10,8)`,
    );
    await queryRunner.query(
      `ALTER TABLE "assignments" ADD IF NOT EXISTS "driver_id_uuid" uuid`,
    );

    // Modify backfill_jobs columns
    await queryRunner.query(
      `ALTER TABLE "backfill_jobs" DROP COLUMN IF EXISTS "table_name"`,
    );
    await queryRunner.query(
      `ALTER TABLE "backfill_jobs" ADD "table_name" character varying(255) NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "backfill_jobs" DROP COLUMN IF EXISTS "migration_name"`,
    );
    await queryRunner.query(
      `ALTER TABLE "backfill_jobs" ADD "migration_name" character varying(255) NOT NULL`,
    );

    // Modify delivery tables
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."idx_delivery_events_seller_order_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "delivery_events" DROP COLUMN IF EXISTS "seller_order_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "delivery_events" ADD "seller_order_id" character varying NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "deliveries" DROP COLUMN IF EXISTS "channel_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "deliveries" ADD "channel_id" character varying NOT NULL`,
    );

    // Set NOT NULL on idempotency_key
    await queryRunner.query(
      `ALTER TABLE "outbox" ALTER COLUMN "idempotency_key" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "outbox_archive" ALTER COLUMN "idempotency_key" SET NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "outbox_archive" ALTER COLUMN "idempotency_key" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "outbox" ALTER COLUMN "idempotency_key" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "deliveries" DROP COLUMN IF EXISTS "channel_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "deliveries" ADD "channel_id" uuid NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "delivery_events" DROP COLUMN IF EXISTS "seller_order_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "delivery_events" ADD "seller_order_id" uuid NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_delivery_events_seller_order_id" ON "delivery_events" ("seller_order_id")`,
    );
    await queryRunner.query(
      `ALTER TABLE "backfill_jobs" DROP COLUMN IF EXISTS "migration_name"`,
    );
    await queryRunner.query(
      `ALTER TABLE "backfill_jobs" ADD "migration_name" character varying NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "backfill_jobs" DROP COLUMN IF EXISTS "table_name"`,
    );
    await queryRunner.query(
      `ALTER TABLE "backfill_jobs" ADD "table_name" character varying NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "assignments" DROP COLUMN IF EXISTS "driver_id_uuid"`,
    );
    await queryRunner.query(
      `ALTER TABLE "drivers" DROP COLUMN IF EXISTS "last_lon"`,
    );
    await queryRunner.query(
      `ALTER TABLE "drivers" DROP COLUMN IF EXISTS "last_lat"`,
    );
    await queryRunner.query(
      `ALTER TABLE "outbox" DROP COLUMN IF EXISTS "updated_at"`,
    );
    await queryRunner.query(`DROP TABLE IF EXISTS "schema_differences"`);
    await queryRunner.query(
      `CREATE INDEX "idx_delivery_metrics_zone_id" ON "delivery_metrics" ("zone_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_delivery_metrics_driver_id" ON "delivery_metrics" ("driver_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_delivery_metrics_seller_order_id" ON "delivery_metrics" ("seller_order_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_delivery_metrics_delivery_id" ON "delivery_metrics" ("delivery_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_driver_stats_driver_id" ON "driver_stats" ("driver_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_delivery_active_driver" ON "deliveries" ("driver_id", "status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_backfill_jobs_created_at" ON "backfill_jobs" ("created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_backfill_jobs_table_name" ON "backfill_jobs" ("table_name")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_backfill_jobs_status" ON "backfill_jobs" ("status")`,
    );
  }
}
