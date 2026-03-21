import { MigrationInterface, QueryRunner } from "typeorm";
/**
 * INTENT:    Phase 1 of 2 — <REQUIRED — describe what this migration achieves>
 * TYPE:      BREAKING
 * RISK:      HIGH
 * ROLLBACK:  DATA_LOSS
 * *
 * COMPANION MIGRATIONS (auto-generated — apply in this order):
 *   1774073622142-DATA_FinalAlignment.ts
 *   1774073622143-BREAKING_FinalAlignment.ts
 *   1774073622144-DATA_FinalAlignment.ts
 *   1774073622145-BREAKING_FinalAlignment.ts
 *   1774073622146-DATA_FinalAlignment.ts
 *   1774073622147-BREAKING_FinalAlignment.ts
 *   1774073622148-DATA_FinalAlignment.ts
 *   1774073622149-BREAKING_FinalAlignment.ts
 *   1774073622150-DATA_FinalAlignment.ts
 *   1774073622151-BREAKING_FinalAlignment.ts
 *   1774073622152-DATA_FinalAlignment.ts
 *   1774073622153-BREAKING_FinalAlignment.ts
 *   1774073622154-DATA_FinalAlignment.ts
 *   1774073622155-BREAKING_FinalAlignment.ts
 *   1774073622156-DATA_FinalAlignment.ts
 *   1774073622157-BREAKING_FinalAlignment.ts
 *   1774073622158-DATA_FinalAlignment.ts
 *   1774073622159-BREAKING_FinalAlignment.ts
 *   1774073622160-DATA_FinalAlignment.ts
 *   1774073622161-BREAKING_FinalAlignment.ts
 *   1774073622162-DATA_FinalAlignment.ts
 *   1774073622163-BREAKING_FinalAlignment.ts
 *   1774073622164-DATA_FinalAlignment.ts
 *   1774073622165-BREAKING_FinalAlignment.ts
 *   1774073622166-DATA_FinalAlignment.ts
 *   1774073622167-BREAKING_FinalAlignment.ts
 *   1774073622168-DATA_FinalAlignment.ts
 *   1774073622169-BREAKING_FinalAlignment.ts
 *   1774073622170-DATA_FinalAlignment.ts
 *   1774073622171-BREAKING_FinalAlignment.ts
 *   1774073622172-DATA_FinalAlignment.ts
 *   1774073622173-BREAKING_FinalAlignment.ts
 *   1774073622174-DATA_FinalAlignment.ts
 *   1774073622175-BREAKING_FinalAlignment.ts
 *   1774073622176-DATA_FinalAlignment.ts
 *   1774073622177-BREAKING_FinalAlignment.ts
 *   1774073622178-DATA_FinalAlignment.ts
 *   1774073622179-BREAKING_FinalAlignment.ts
 *   1774073622180-DATA_FinalAlignment.ts
 *   1774073622181-BREAKING_FinalAlignment.ts
 *   1774073622182-DATA_FinalAlignment.ts
 *   1774073622183-BREAKING_FinalAlignment.ts
 *   1774073622184-DATA_FinalAlignment.ts
 *   1774073622185-BREAKING_FinalAlignment.ts
 *   1774073622186-DATA_FinalAlignment.ts
 *   1774073622187-BREAKING_FinalAlignment.ts
 *
 * AUTO-SAFETY: This file was rewritten by the migration CLI.
 * Original NOT NULL violation(s) were split into companion DATA_ and BREAKING_ files.
 *
 * @approved-breaking: <REQUIRED — reviewer name + reason this is safe to deploy>
 *
 * CHECKLIST (mark [x] before merging):
 *   [ ] @approved-breaking filled in with reviewer name and reason
 *   [ ] All app code no longer references dropped/changed column
 *   [ ] Backward-compat layer deployed before this migration
 *   [ ] Coordinated deploy window with team
 *   [ ] Tested migration:revert locally
 *   [ ] Passes: npm run db:validate
 */


export class SAFEFinalAlignment1774073622141 implements MigrationInterface {
    name = 'SAFEFinalAlignment1774073622141'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "admin_users" DROP CONSTRAINT "fk_admin_users_city"`);
        await queryRunner.query(`ALTER TABLE "zones" DROP CONSTRAINT "fk_zones_city"`);
        await queryRunner.query(`DROP INDEX "public"."idx_outbox_worker"`);
        await queryRunner.query(`DROP INDEX "public"."idx_outbox_locked"`);
        await queryRunner.query(`DROP INDEX "public"."idx_admin_users_is_active"`);
        await queryRunner.query(`DROP INDEX "public"."idx_admin_users_city_id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_zones_city_id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_drivers_status"`);
        await queryRunner.query(`DROP INDEX "public"."idx_drivers_city_id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_drivers_zone_id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_delivery_pending"`);
        await queryRunner.query(`DROP INDEX "public"."idx_delivery_active_driver"`);
        await queryRunner.query(`ALTER TABLE "outbox" DROP COLUMN "updated_at"`);
        await queryRunner.query(`ALTER TABLE "outbox" ADD "updated_at" TIMESTAMP`);
        await queryRunner.query(`ALTER TYPE "public"."outbox_status_enum" RENAME TO "outbox_status_enum_old"`);
        await queryRunner.query(`CREATE TYPE "public"."outbox_status_enum" AS ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')`);
        await queryRunner.query(`ALTER TABLE "outbox" ALTER COLUMN "status" TYPE "public"."outbox_status_enum" USING "status"::"text"::"public"."outbox_status_enum"`);
        await queryRunner.query(`DROP TYPE "public"."outbox_status_enum_old"`);
        await queryRunner.query(`ALTER TABLE "outbox" DROP COLUMN "last_error"`);
        await queryRunner.query(`ALTER TABLE "outbox" ADD "last_error" text`);
        await queryRunner.query(`ALTER TABLE "outbox" ALTER COLUMN "idempotency_key" DROP`);
        await queryRunner.query(`ALTER TABLE "outbox" DROP CONSTRAINT "uq_outbox_idempotency_key"`);
        await queryRunner.query(`ALTER TABLE "outbox" DROP COLUMN "version"`);
        await queryRunner.query(`ALTER TABLE "outbox" ADD "version" integer DEFAULT '1'`);
        await queryRunner.query(`ALTER TABLE "cities" DROP CONSTRAINT "uq_cities_code"`);
        await queryRunner.query(`ALTER TABLE "cities" ALTER COLUMN "center" TYPE point`);
        await queryRunner.query(`ALTER TABLE "zones" DROP CONSTRAINT "uq_zones_code"`);
        await queryRunner.query(`ALTER TABLE "zones" ALTER COLUMN "boundary" TYPE polygon`);
        await queryRunner.query(`DROP INDEX "public"."idx_audit_logs_resource"`);
        await queryRunner.query(`DROP INDEX "public"."idx_audit_logs_user_id"`);
        await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN "user_id"`);
        await queryRunner.query(`ALTER TABLE "audit_logs" ADD "user_id" uuid`);
        await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN "resource_id"`);
        await queryRunner.query(`ALTER TABLE "audit_logs" ADD "resource_id" uuid`);
        await queryRunner.query(`ALTER TABLE "outbox" DROP COLUMN "status"`);
        await queryRunner.query(`DROP TYPE "public"."outbox_status_enum"`);
        await queryRunner.query(`ALTER TABLE "outbox" ADD "status" character varying`);
        await queryRunner.query(`ALTER TABLE "outbox" DROP COLUMN "last_error"`);
        await queryRunner.query(`ALTER TABLE "outbox" ADD "last_error" character varying`);
        await queryRunner.query(`ALTER TABLE "outbox_archive" DROP COLUMN "status"`);
        await queryRunner.query(`DROP TYPE "public"."outbox_status_enum"`);
        await queryRunner.query(`ALTER TABLE "outbox_archive" ADD "status" character varying`);
        await queryRunner.query(`ALTER TABLE "outbox_archive" ALTER COLUMN "archived_at" DROP DEFAULT`);
        await queryRunner.query(`ALTER TABLE "drivers" DROP COLUMN "auth_provider"`);
        await queryRunner.query(`DROP TYPE "public"."auth_provider_enum"`);
        await queryRunner.query(`ALTER TABLE "drivers" ADD "auth_provider" character varying DEFAULT 'legacy'`);
        await queryRunner.query(`DROP INDEX "public"."idx_delivery_events_seller_order_id"`);
        await queryRunner.query(`ALTER TABLE "delivery_events" DROP COLUMN "seller_order_id"`);
        await queryRunner.query(`ALTER TABLE "delivery_events" ADD "seller_order_id" uuid`);
        await queryRunner.query(`ALTER TABLE "deliveries" DROP CONSTRAINT "uq_deliveries_seller_order_id"`);
        await queryRunner.query(`ALTER TABLE "deliveries" DROP COLUMN "seller_order_id"`);
        await queryRunner.query(`ALTER TABLE "deliveries" ADD "seller_order_id" uuid`);
        await queryRunner.query(`ALTER TABLE "deliveries" DROP COLUMN "channel_id"`);
        await queryRunner.query(`ALTER TABLE "deliveries" ADD "channel_id" uuid`);
        await queryRunner.query(`DROP INDEX "public"."idx_assignments_seller_driver"`);
        await queryRunner.query(`ALTER TABLE "assignments" DROP COLUMN "seller_order_id"`);
        await queryRunner.query(`ALTER TABLE "assignments" ADD "seller_order_id" uuid`);
        await queryRunner.query(`ALTER TABLE "assignments" DROP COLUMN "driver_id"`);
        await queryRunner.query(`ALTER TABLE "assignments" ADD "driver_id" uuid`);
        await queryRunner.query(`CREATE INDEX "IDX_71bd654a40110dd404847b1b87" ON "admin_users" ("is_active") `);
        await queryRunner.query(`CREATE INDEX "IDX_ebd44622c0e2e69538e2daa5ad" ON "admin_users" ("city_id") `);
        await queryRunner.query(`CREATE INDEX "idx_audit_logs_resource" ON "audit_logs" ("resource_type", "resource_id") `);
        await queryRunner.query(`CREATE INDEX "idx_audit_logs_user_id" ON "audit_logs" ("user_id") `);
        await queryRunner.query(`CREATE INDEX "idx_delivery_pending" ON "driver_offers" ("delivery_id") `);
        await queryRunner.query(`CREATE INDEX "idx_created_at" ON "driver_offers" ("notification_sent_at") `);
        await queryRunner.query(`CREATE INDEX "IDX_dae9223023a6734f8763c7cf16" ON "drivers" ("status") `);
        await queryRunner.query(`CREATE INDEX "idx_drivers_status_zone" ON "drivers" ("status", "zone_id") `);
        await queryRunner.query(`CREATE INDEX "idx_drivers_status_city" ON "drivers" ("status", "city_id") `);
        await queryRunner.query(`CREATE INDEX "idx_drivers_zone_id" ON "drivers" () `);
        await queryRunner.query(`CREATE INDEX "idx_drivers_city_id" ON "drivers" () `);
        await queryRunner.query(`CREATE INDEX "idx_drivers_status" ON "drivers" () `);
        await queryRunner.query(`CREATE INDEX "idx_delivery_events_seller_order_id" ON "delivery_events" ("seller_order_id") `);
        await queryRunner.query(`CREATE INDEX "idx_deliveries_status_driver" ON "deliveries" ("status", "driver_id") `);
        await queryRunner.query(`CREATE UNIQUE INDEX "IDX_893fd6f41c4de89d3968473d9f" ON "deliveries" ("seller_order_id") `);
        await queryRunner.query(`CREATE INDEX "idx_assignments_seller_driver" ON "assignments" ("seller_order_id", "driver_id") `);
        await queryRunner.query(`ALTER TABLE "admin_users" ADD CONSTRAINT "fk_admin_users_city" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "zones" ADD CONSTRAINT "fk_zones_city" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE NO ACTION ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "zones" DROP CONSTRAINT "fk_zones_city"`);
        await queryRunner.query(`ALTER TABLE "admin_users" DROP CONSTRAINT "fk_admin_users_city"`);
        await queryRunner.query(`DROP INDEX "public"."idx_assignments_seller_driver"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_893fd6f41c4de89d3968473d9f"`);
        await queryRunner.query(`DROP INDEX "public"."idx_deliveries_status_driver"`);
        await queryRunner.query(`DROP INDEX "public"."idx_delivery_events_seller_order_id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_drivers_status"`);
        await queryRunner.query(`DROP INDEX "public"."idx_drivers_city_id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_drivers_zone_id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_drivers_status_city"`);
        await queryRunner.query(`DROP INDEX "public"."idx_drivers_status_zone"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_dae9223023a6734f8763c7cf16"`);
        await queryRunner.query(`DROP INDEX "public"."idx_created_at"`);
        await queryRunner.query(`DROP INDEX "public"."idx_delivery_pending"`);
        await queryRunner.query(`DROP INDEX "public"."idx_audit_logs_user_id"`);
        await queryRunner.query(`DROP INDEX "public"."idx_audit_logs_resource"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_ebd44622c0e2e69538e2daa5ad"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_71bd654a40110dd404847b1b87"`);
        await queryRunner.query(`ALTER TABLE "assignments" DROP COLUMN "driver_id"`);
        await queryRunner.query(`ALTER TABLE "assignments" ADD "driver_id" character varying`);
        await queryRunner.query(`ALTER TABLE "assignments" DROP COLUMN "seller_order_id"`);
        await queryRunner.query(`ALTER TABLE "assignments" ADD "seller_order_id" character varying`);
        await queryRunner.query(`CREATE INDEX "idx_assignments_seller_driver" ON "assignments" ("seller_order_id", "driver_id") `);
        await queryRunner.query(`ALTER TABLE "deliveries" DROP COLUMN "channel_id"`);
        await queryRunner.query(`ALTER TABLE "deliveries" ADD "channel_id" character varying`);
        await queryRunner.query(`ALTER TABLE "deliveries" DROP COLUMN "seller_order_id"`);
        await queryRunner.query(`ALTER TABLE "deliveries" ADD "seller_order_id" character varying`);
        await queryRunner.query(`ALTER TABLE "deliveries" ADD CONSTRAINT "uq_deliveries_seller_order_id" UNIQUE ("seller_order_id")`);
        await queryRunner.query(`ALTER TABLE "delivery_events" DROP COLUMN "seller_order_id"`);
        await queryRunner.query(`ALTER TABLE "delivery_events" ADD "seller_order_id" character varying`);
        await queryRunner.query(`CREATE INDEX "idx_delivery_events_seller_order_id" ON "delivery_events" ("seller_order_id") `);
        await queryRunner.query(`ALTER TABLE "drivers" DROP COLUMN "auth_provider"`);
        await queryRunner.query(`CREATE TYPE "public"."auth_provider_enum" AS ENUM('legacy', 'google', 'email')`);
        await queryRunner.query(`ALTER TABLE "drivers" ADD "auth_provider" "public"."auth_provider_enum" DEFAULT 'legacy'`);
        await queryRunner.query(`ALTER TABLE "outbox_archive" ALTER COLUMN "archived_at" SET DEFAULT now()`);
        await queryRunner.query(`ALTER TABLE "outbox_archive" DROP COLUMN "status"`);
        await queryRunner.query(`CREATE TYPE "public"."outbox_status_enum" AS ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')`);
        await queryRunner.query(`ALTER TABLE "outbox_archive" ADD "status" "public"."outbox_status_enum"`);
        await queryRunner.query(`ALTER TABLE "outbox" DROP COLUMN "last_error"`);
        await queryRunner.query(`ALTER TABLE "outbox" ADD "last_error" text`);
        await queryRunner.query(`ALTER TABLE "outbox" DROP COLUMN "status"`);
        await queryRunner.query(`CREATE TYPE "public"."outbox_status_enum" AS ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')`);
        await queryRunner.query(`ALTER TABLE "outbox" ADD "status" "public"."outbox_status_enum"`);
        await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN "resource_id"`);
        await queryRunner.query(`ALTER TABLE "audit_logs" ADD "resource_id" character varying`);
        await queryRunner.query(`ALTER TABLE "audit_logs" DROP COLUMN "user_id"`);
        await queryRunner.query(`ALTER TABLE "audit_logs" ADD "user_id" character varying`);
        await queryRunner.query(`CREATE INDEX "idx_audit_logs_user_id" ON "audit_logs" ("user_id") `);
        await queryRunner.query(`CREATE INDEX "idx_audit_logs_resource" ON "audit_logs" ("resource_type", "resource_id") `);
        await queryRunner.query(`ALTER TABLE "zones" ALTER COLUMN "boundary" TYPE polygon`);
        await queryRunner.query(`ALTER TABLE "zones" ADD CONSTRAINT "uq_zones_code" UNIQUE ("code")`);
        await queryRunner.query(`ALTER TABLE "cities" ALTER COLUMN "center" TYPE point`);
        await queryRunner.query(`ALTER TABLE "cities" ADD CONSTRAINT "uq_cities_code" UNIQUE ("code")`);
        await queryRunner.query(`ALTER TABLE "outbox" DROP COLUMN "version"`);
        await queryRunner.query(`ALTER TABLE "outbox" ADD "version" smallint DEFAULT '1'`);
        await queryRunner.query(`ALTER TABLE "outbox" ADD CONSTRAINT "uq_outbox_idempotency_key" UNIQUE ("idempotency_key")`);
        await queryRunner.query(`ALTER TABLE "outbox" ALTER COLUMN "idempotency_key" SET NOT NULL`);
        await queryRunner.query(`ALTER TABLE "outbox" DROP COLUMN "last_error"`);
        await queryRunner.query(`ALTER TABLE "outbox" ADD "last_error" character varying`);
        await queryRunner.query(`CREATE TYPE "public"."outbox_status_enum_old" AS ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')`);
        await queryRunner.query(`ALTER TABLE "outbox" ALTER COLUMN "status" TYPE "public"."outbox_status_enum_old" USING "status"::"text"::"public"."outbox_status_enum_old"`);
        await queryRunner.query(`DROP TYPE "public"."outbox_status_enum"`);
        await queryRunner.query(`ALTER TYPE "public"."outbox_status_enum_old" RENAME TO "outbox_status_enum"`);
        await queryRunner.query(`ALTER TABLE "outbox" DROP COLUMN "updated_at"`);
        await queryRunner.query(`ALTER TABLE "outbox" ADD "updated_at" TIMESTAMP`);
        await queryRunner.query(`CREATE INDEX "idx_delivery_active_driver" ON "deliveries" ("driver_id", "status") `);
        await queryRunner.query(`CREATE INDEX "idx_delivery_pending" ON "delivery_events" ("delivery_id") `);
        await queryRunner.query(`CREATE INDEX "idx_drivers_zone_id" ON "drivers" ("zone_id") `);
        await queryRunner.query(`CREATE INDEX "idx_drivers_city_id" ON "drivers" ("city_id") `);
        await queryRunner.query(`CREATE INDEX "idx_drivers_status" ON "drivers" ("status") `);
        await queryRunner.query(`CREATE INDEX "idx_zones_city_id" ON "zones" ("city_id") `);
        await queryRunner.query(`CREATE INDEX "idx_admin_users_city_id" ON "admin_users" ("city_id") `);
        await queryRunner.query(`CREATE INDEX "idx_admin_users_is_active" ON "admin_users" ("is_active") `);
        await queryRunner.query(`CREATE INDEX "idx_outbox_locked" ON "outbox" ("locked_at") WHERE (status = 'PROCESSING'::outbox_status_enum)`);
        await queryRunner.query(`CREATE INDEX "idx_outbox_worker" ON "outbox" ("status", "next_retry_at") WHERE (status = 'PENDING'::outbox_status_enum)`);
        await queryRunner.query(`ALTER TABLE "zones" ADD CONSTRAINT "fk_zones_city" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE RESTRICT ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "admin_users" ADD CONSTRAINT "fk_admin_users_city" FOREIGN KEY ("city_id") REFERENCES "cities"("id") ON DELETE SET NULL ON UPDATE NO ACTION`);
    }

}
