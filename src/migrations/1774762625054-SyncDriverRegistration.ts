import { MigrationInterface, QueryRunner } from "typeorm";

export class SyncDriverRegistration1774762625054 implements MigrationInterface {
  name = "SyncDriverRegistration1774762625054";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "dispatch_decisions" DROP CONSTRAINT "FK_007b249b21c0028d61d56fb1e30"`,
    );
    await queryRunner.query(
      `ALTER TABLE "dispatch_decisions" DROP CONSTRAINT "FK_b7552521d7862ec66129d4e9799"`,
    );
    await queryRunner.query(
      `ALTER TABLE "dispatch_scores" DROP CONSTRAINT "FK_19e25d3403ae383bfb766bf5dec"`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_backfill_jobs_status"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_backfill_jobs_table_name"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_backfill_jobs_created_at"`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_delivery_active_driver"`);
    await queryRunner.query(`DROP INDEX "public"."idx_driver_stats_driver_id"`);
    await queryRunner.query(
      `DROP INDEX "public"."idx_delivery_metrics_delivery_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_delivery_metrics_seller_order_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_delivery_metrics_driver_id"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_delivery_metrics_zone_id"`,
    );
    await queryRunner.query(
      `CREATE TABLE "schema_differences" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "table" character varying(255) NOT NULL, "column" character varying(255), "index" character varying(255), "constraint" character varying(255), "type" character varying(50) NOT NULL, "severity" character varying(20) NOT NULL, "description" text NOT NULL, "entity" jsonb, "database" jsonb, "status" character varying(50) NOT NULL, "readiness" character varying(50) NOT NULL DEFAULT 'PENDING', "validation_status" character varying(50) NOT NULL DEFAULT 'PENDING', "suggested_action" text, "backfill_sql" text, "backfill_job_id" uuid, "migration_name" character varying, "detected_at" TIMESTAMP, "backfill_scheduled_at" TIMESTAMP, "backfill_started_at" TIMESTAMP, "backfill_completed_at" TIMESTAMP, "ready_for_migration_at" TIMESTAMP, "migrated_at" TIMESTAMP, "error_message" text, "metadata" jsonb NOT NULL DEFAULT '{}', "created_at" TIMESTAMP NOT NULL DEFAULT now(), "updated_at" TIMESTAMP NOT NULL DEFAULT now(), CONSTRAINT "PK_037b9161f5a14ffaf5d32472251" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `ALTER TABLE "outbox" ADD "updated_at" TIMESTAMP DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE "drivers" ADD "last_lat" numeric(10,8)`,
    );
    await queryRunner.query(
      `ALTER TABLE "drivers" ADD "last_lon" numeric(10,8)`,
    );
    await queryRunner.query(
      `ALTER TABLE "assignments" ADD "driver_id_uuid" uuid`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_outbox_worker"`);
    await queryRunner.query(
      `ALTER TABLE "outbox" ALTER COLUMN "status" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."outbox_status_enum" RENAME TO "outbox_status_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."outbox_status_enum" AS ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')`,
    );
    await queryRunner.query(
      `ALTER TABLE "outbox" ALTER COLUMN "status" TYPE text USING "status"::text`,
    );
    await queryRunner.query(`DROP TYPE "public"."outbox_status_enum_old"`);
    await queryRunner.query(
      `ALTER TABLE "outbox" ALTER COLUMN "status" TYPE "public"."outbox_status_enum" USING "status"::"public"."outbox_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "outbox" ALTER COLUMN "status" SET DEFAULT 'PENDING'`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."outbox_priority_enum" RENAME TO "outbox_priority_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."outbox_priority_enum" AS ENUM('HIGH', 'MEDIUM', 'LOW')`,
    );
    await queryRunner.query(
      `ALTER TABLE "outbox" ALTER COLUMN "priority" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "outbox" ALTER COLUMN "priority" TYPE "public"."outbox_priority_enum" USING "priority"::"text"::"public"."outbox_priority_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "outbox" ALTER COLUMN "priority" SET DEFAULT 'MEDIUM'`,
    );
    await queryRunner.query(`DROP TYPE "public"."outbox_priority_enum_old"`);
    await queryRunner.query(
      `ALTER TABLE "outbox" ALTER COLUMN "idempotency_key" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "outbox_archive" ALTER COLUMN "idempotency_key" SET NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "backfill_jobs" DROP COLUMN "table_name"`,
    );
    await queryRunner.query(
      `ALTER TABLE "backfill_jobs" ADD "table_name" character varying(255) NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "backfill_jobs" DROP COLUMN "migration_name"`,
    );
    await queryRunner.query(
      `ALTER TABLE "backfill_jobs" ADD "migration_name" character varying(255) NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "drivers" DROP COLUMN "auth_provider"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."auth_provider_enum" AS ENUM('legacy', 'google', 'email')`,
    );
    await queryRunner.query(
      `ALTER TABLE "drivers" ADD "auth_provider" "public"."auth_provider_enum" NOT NULL DEFAULT 'legacy'`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_delivery_events_seller_order_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "delivery_events" DROP COLUMN "seller_order_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "delivery_events" ADD "seller_order_id" character varying NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "deliveries" DROP COLUMN "channel_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "deliveries" ADD "channel_id" character varying NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."dispatch_decisions_cohort_enum" RENAME TO "dispatch_decisions_cohort_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."dispatch_decisions_cohort_enum" AS ENUM('CONTROL', 'SCORING', 'MANUAL')`,
    );
    await queryRunner.query(
      `ALTER TABLE "dispatch_decisions" ALTER COLUMN "cohort" TYPE "public"."dispatch_decisions_cohort_enum" USING "cohort"::"text"::"public"."dispatch_decisions_cohort_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."dispatch_decisions_cohort_enum_old"`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."dispatch_decisions_dispatch_method_enum" RENAME TO "dispatch_decisions_dispatch_method_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."dispatch_decisions_dispatch_method_enum" AS ENUM('LEGACY', 'SCORING_BASED', 'MANUAL_OVERRIDE')`,
    );
    await queryRunner.query(
      `ALTER TABLE "dispatch_decisions" ALTER COLUMN "dispatch_method" TYPE "public"."dispatch_decisions_dispatch_method_enum" USING "dispatch_method"::"text"::"public"."dispatch_decisions_dispatch_method_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."dispatch_decisions_dispatch_method_enum_old"`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."dispatch_decisions_dispatch_status_enum" RENAME TO "dispatch_decisions_dispatch_status_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."dispatch_decisions_dispatch_status_enum" AS ENUM('PENDING', 'ASSIGNED', 'FAILED', 'TIMEOUT')`,
    );
    await queryRunner.query(
      `ALTER TABLE "dispatch_decisions" ALTER COLUMN "dispatch_status" TYPE "public"."dispatch_decisions_dispatch_status_enum" USING "dispatch_status"::"text"::"public"."dispatch_decisions_dispatch_status_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."dispatch_decisions_dispatch_status_enum_old"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_dispatch_scores_driver_type"`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."dispatch_scores_score_type_enum" RENAME TO "dispatch_scores_score_type_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."dispatch_scores_score_type_enum" AS ENUM('OVERALL', 'COMPLETION_RATE', 'TIMING', 'QUALITY')`,
    );
    await queryRunner.query(
      `ALTER TABLE "dispatch_scores" ALTER COLUMN "score_type" TYPE "public"."dispatch_scores_score_type_enum" USING "score_type"::"text"::"public"."dispatch_scores_score_type_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."dispatch_scores_score_type_enum_old"`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."dispatch_scores_score_source_enum" RENAME TO "dispatch_scores_score_source_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."dispatch_scores_score_source_enum" AS ENUM('DRIVER_STATS', 'DELIVERY_METRICS', 'MANUAL_ADJUSTMENT')`,
    );
    await queryRunner.query(
      `ALTER TABLE "dispatch_scores" ALTER COLUMN "score_source" TYPE "public"."dispatch_scores_score_source_enum" USING "score_source"::"text"::"public"."dispatch_scores_score_source_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."dispatch_scores_score_source_enum_old"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_dispatch_configs_type_scope"`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."dispatch_configs_config_type_enum" RENAME TO "dispatch_configs_config_type_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."dispatch_configs_config_type_enum" AS ENUM('SCORING_WEIGHTS', 'THRESHOLDS', 'DECAY_SETTINGS', 'ROLLOUT_SETTINGS')`,
    );
    await queryRunner.query(
      `ALTER TABLE "dispatch_configs" ALTER COLUMN "config_type" TYPE "public"."dispatch_configs_config_type_enum" USING "config_type"::"text"::"public"."dispatch_configs_config_type_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."dispatch_configs_config_type_enum_old"`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."dispatch_configs_config_scope_enum" RENAME TO "dispatch_configs_config_scope_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."dispatch_configs_config_scope_enum" AS ENUM('GLOBAL', 'REGION', 'DRIVER_TYPE')`,
    );
    await queryRunner.query(
      `ALTER TABLE "dispatch_configs" ALTER COLUMN "config_scope" TYPE "public"."dispatch_configs_config_scope_enum" USING "config_scope"::"text"::"public"."dispatch_configs_config_scope_enum"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."dispatch_configs_config_scope_enum_old"`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_outbox_worker" ON "outbox" ("status", "next_retry_at") WHERE (status = 'PENDING'::outbox_status_enum)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_delivery_events_seller_order_id" ON "delivery_events" ("seller_order_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_dispatch_scores_driver_type" ON "dispatch_scores" ("driver_id", "score_type") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_dispatch_configs_type_scope" ON "dispatch_configs" ("config_type", "config_scope") `,
    );
    await queryRunner.query(
      `ALTER TABLE "schema_differences" ADD CONSTRAINT "FK_62d5bd83cc3ff3524983f8f5129" FOREIGN KEY ("backfill_job_id") REFERENCES "backfill_jobs"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "dispatch_decisions" ADD CONSTRAINT "FK_b7552521d7862ec66129d4e9799" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "dispatch_decisions" ADD CONSTRAINT "FK_007b249b21c0028d61d56fb1e30" FOREIGN KEY ("delivery_id") REFERENCES "deliveries"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "dispatch_decisions" DROP CONSTRAINT "FK_007b249b21c0028d61d56fb1e30"`,
    );
    await queryRunner.query(
      `ALTER TABLE "dispatch_decisions" DROP CONSTRAINT "FK_b7552521d7862ec66129d4e9799"`,
    );
    await queryRunner.query(
      `ALTER TABLE "schema_differences" DROP CONSTRAINT "FK_62d5bd83cc3ff3524983f8f5129"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_dispatch_configs_type_scope"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_dispatch_scores_driver_type"`,
    );
    await queryRunner.query(
      `DROP INDEX "public"."idx_delivery_events_seller_order_id"`,
    );
    await queryRunner.query(`DROP INDEX "public"."idx_outbox_worker"`);
    await queryRunner.query(
      `CREATE TYPE "public"."dispatch_configs_config_scope_enum_old" AS ENUM('GLOBAL', 'REGION', 'DRIVER_TYPE')`,
    );
    await queryRunner.query(
      `ALTER TABLE "dispatch_configs" ALTER COLUMN "config_scope" TYPE "public"."dispatch_configs_config_scope_enum_old" USING "config_scope"::"text"::"public"."dispatch_configs_config_scope_enum_old"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."dispatch_configs_config_scope_enum"`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."dispatch_configs_config_scope_enum_old" RENAME TO "dispatch_configs_config_scope_enum"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."dispatch_configs_config_type_enum_old" AS ENUM('SCORING_WEIGHTS', 'THRESHOLDS', 'DECAY_SETTINGS', 'ROLLOUT_SETTINGS')`,
    );
    await queryRunner.query(
      `ALTER TABLE "dispatch_configs" ALTER COLUMN "config_type" TYPE "public"."dispatch_configs_config_type_enum_old" USING "config_type"::"text"::"public"."dispatch_configs_config_type_enum_old"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."dispatch_configs_config_type_enum"`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."dispatch_configs_config_type_enum_old" RENAME TO "dispatch_configs_config_type_enum"`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_dispatch_configs_type_scope" ON "dispatch_configs" ("config_type", "config_scope") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."dispatch_scores_score_source_enum_old" AS ENUM('DRIVER_STATS', 'DELIVERY_METRICS', 'MANUAL_ADJUSTMENT')`,
    );
    await queryRunner.query(
      `ALTER TABLE "dispatch_scores" ALTER COLUMN "score_source" TYPE "public"."dispatch_scores_score_source_enum_old" USING "score_source"::"text"::"public"."dispatch_scores_score_source_enum_old"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."dispatch_scores_score_source_enum"`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."dispatch_scores_score_source_enum_old" RENAME TO "dispatch_scores_score_source_enum"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."dispatch_scores_score_type_enum_old" AS ENUM('OVERALL', 'COMPLETION_RATE', 'TIMING', 'QUALITY')`,
    );
    await queryRunner.query(
      `ALTER TABLE "dispatch_scores" ALTER COLUMN "score_type" TYPE "public"."dispatch_scores_score_type_enum_old" USING "score_type"::"text"::"public"."dispatch_scores_score_type_enum_old"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."dispatch_scores_score_type_enum"`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."dispatch_scores_score_type_enum_old" RENAME TO "dispatch_scores_score_type_enum"`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_dispatch_scores_driver_type" ON "dispatch_scores" ("driver_id", "score_type") `,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."dispatch_decisions_dispatch_status_enum_old" AS ENUM('PENDING', 'ASSIGNED', 'FAILED', 'TIMEOUT')`,
    );
    await queryRunner.query(
      `ALTER TABLE "dispatch_decisions" ALTER COLUMN "dispatch_status" TYPE "public"."dispatch_decisions_dispatch_status_enum_old" USING "dispatch_status"::"text"::"public"."dispatch_decisions_dispatch_status_enum_old"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."dispatch_decisions_dispatch_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."dispatch_decisions_dispatch_status_enum_old" RENAME TO "dispatch_decisions_dispatch_status_enum"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."dispatch_decisions_dispatch_method_enum_old" AS ENUM('LEGACY', 'SCORING_BASED', 'MANUAL_OVERRIDE')`,
    );
    await queryRunner.query(
      `ALTER TABLE "dispatch_decisions" ALTER COLUMN "dispatch_method" TYPE "public"."dispatch_decisions_dispatch_method_enum_old" USING "dispatch_method"::"text"::"public"."dispatch_decisions_dispatch_method_enum_old"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."dispatch_decisions_dispatch_method_enum"`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."dispatch_decisions_dispatch_method_enum_old" RENAME TO "dispatch_decisions_dispatch_method_enum"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."dispatch_decisions_cohort_enum_old" AS ENUM('CONTROL', 'SCORING', 'MANUAL')`,
    );
    await queryRunner.query(
      `ALTER TABLE "dispatch_decisions" ALTER COLUMN "cohort" TYPE "public"."dispatch_decisions_cohort_enum_old" USING "cohort"::"text"::"public"."dispatch_decisions_cohort_enum_old"`,
    );
    await queryRunner.query(
      `DROP TYPE "public"."dispatch_decisions_cohort_enum"`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."dispatch_decisions_cohort_enum_old" RENAME TO "dispatch_decisions_cohort_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "deliveries" DROP COLUMN "channel_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "deliveries" ADD "channel_id" uuid NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "delivery_events" DROP COLUMN "seller_order_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "delivery_events" ADD "seller_order_id" uuid NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_delivery_events_seller_order_id" ON "delivery_events" ("seller_order_id") `,
    );
    await queryRunner.query(
      `ALTER TABLE "drivers" DROP COLUMN "auth_provider"`,
    );
    await queryRunner.query(`DROP TYPE "public"."auth_provider_enum"`);
    await queryRunner.query(
      `ALTER TABLE "drivers" ADD "auth_provider" character varying(255) NOT NULL DEFAULT 'legacy'`,
    );
    await queryRunner.query(
      `ALTER TABLE "backfill_jobs" DROP COLUMN "migration_name"`,
    );
    await queryRunner.query(
      `ALTER TABLE "backfill_jobs" ADD "migration_name" character varying NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "backfill_jobs" DROP COLUMN "table_name"`,
    );
    await queryRunner.query(
      `ALTER TABLE "backfill_jobs" ADD "table_name" character varying NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "outbox_archive" ALTER COLUMN "idempotency_key" DROP NOT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "outbox" ALTER COLUMN "idempotency_key" DROP NOT NULL`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."outbox_priority_enum_old" AS ENUM('HIGH', 'MEDIUM', 'LOW')`,
    );
    await queryRunner.query(
      `ALTER TABLE "outbox" ALTER COLUMN "priority" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "outbox" ALTER COLUMN "priority" TYPE "public"."outbox_priority_enum_old" USING "priority"::"text"::"public"."outbox_priority_enum_old"`,
    );
    await queryRunner.query(
      `ALTER TABLE "outbox" ALTER COLUMN "priority" SET DEFAULT 'MEDIUM'`,
    );
    await queryRunner.query(`DROP TYPE "public"."outbox_priority_enum"`);
    await queryRunner.query(
      `ALTER TYPE "public"."outbox_priority_enum_old" RENAME TO "outbox_priority_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "outbox" ALTER COLUMN "status" DROP DEFAULT`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."outbox_status_enum_old" AS ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')`,
    );
    await queryRunner.query(
      `ALTER TABLE "outbox" ALTER COLUMN "status" TYPE text USING "status"::text`,
    );
    await queryRunner.query(`DROP TYPE "public"."outbox_status_enum"`);
    await queryRunner.query(
      `ALTER TABLE "outbox" ALTER COLUMN "status" TYPE "public"."outbox_status_enum_old" USING "status"::"public"."outbox_status_enum_old"`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."outbox_status_enum_old" RENAME TO "outbox_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "outbox" ALTER COLUMN "status" SET DEFAULT 'PENDING'`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_outbox_worker" ON "outbox" ("status", "next_retry_at") WHERE (status = 'PENDING'::outbox_status_enum)`,
    );
    await queryRunner.query(
      `ALTER TABLE "assignments" DROP COLUMN "driver_id_uuid"`,
    );
    await queryRunner.query(`ALTER TABLE "drivers" DROP COLUMN "last_lon"`);
    await queryRunner.query(`ALTER TABLE "drivers" DROP COLUMN "last_lat"`);
    await queryRunner.query(`ALTER TABLE "outbox" DROP COLUMN "updated_at"`);
    await queryRunner.query(`DROP TABLE "schema_differences"`);
    await queryRunner.query(
      `CREATE INDEX "idx_delivery_metrics_zone_id" ON "delivery_metrics" ("zone_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_delivery_metrics_driver_id" ON "delivery_metrics" ("driver_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_delivery_metrics_seller_order_id" ON "delivery_metrics" ("seller_order_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_delivery_metrics_delivery_id" ON "delivery_metrics" ("delivery_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_driver_stats_driver_id" ON "driver_stats" ("driver_id") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_delivery_active_driver" ON "deliveries" ("driver_id", "status") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_backfill_jobs_created_at" ON "backfill_jobs" ("created_at") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_backfill_jobs_table_name" ON "backfill_jobs" ("table_name") `,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_backfill_jobs_status" ON "backfill_jobs" ("status") `,
    );
    await queryRunner.query(
      `ALTER TABLE "dispatch_scores" ADD CONSTRAINT "FK_19e25d3403ae383bfb766bf5dec" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "dispatch_decisions" ADD CONSTRAINT "FK_b7552521d7862ec66129d4e9799" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE NO ACTION`,
    );
    await queryRunner.query(
      `ALTER TABLE "dispatch_decisions" ADD CONSTRAINT "FK_007b249b21c0028d61d56fb1e30" FOREIGN KEY ("delivery_id") REFERENCES "deliveries"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    );
  }
}
