// MIGRATION_GUARD:ALLOW_DESTRUCTIVE
import { MigrationInterface, QueryRunner } from "typeorm";

export class SyncDriverRegistrationOutboxEnums1774762625055 implements MigrationInterface {
  name = "SyncDriverRegistrationOutboxEnums1774762625055";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop outbox indexes that depend on enum
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."idx_outbox_worker"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."idx_outbox_locked"`,
    );

    // Drop foreign key constraints
    await queryRunner.query(
      `ALTER TABLE "dispatch_decisions" DROP CONSTRAINT IF EXISTS "FK_007b249b21c0028d61d56fb1e30"`,
    );
    await queryRunner.query(
      `ALTER TABLE "dispatch_decisions" DROP CONSTRAINT IF EXISTS "FK_b7552521d7862ec66129d4e9799"`,
    );
    await queryRunner.query(
      `ALTER TABLE "dispatch_scores" DROP CONSTRAINT IF EXISTS "FK_19e25d3403ae383bfb766bf5dec"`,
    );

    // Safe outbox status enum migration - convert BOTH tables
    await queryRunner.query(
      `ALTER TABLE "outbox" ALTER COLUMN "status" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "outbox_archive" ALTER COLUMN "status" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "outbox" ALTER COLUMN "status" TYPE text USING "status"::text`,
    );
    await queryRunner.query(
      `ALTER TABLE "outbox_archive" ALTER COLUMN "status" TYPE text USING "status"::text`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."outbox_status_enum" RENAME TO "outbox_status_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."outbox_status_enum" AS ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')`,
    );
    await queryRunner.query(
      `ALTER TABLE "outbox" ALTER COLUMN "status" TYPE "public"."outbox_status_enum" USING "status"::"public"."outbox_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "outbox_archive" ALTER COLUMN "status" TYPE "public"."outbox_status_enum" USING "status"::"public"."outbox_status_enum"`,
    );
    await queryRunner.query(`DROP TYPE "public"."outbox_status_enum_old"`);
    await queryRunner.query(
      `ALTER TABLE "outbox" ALTER COLUMN "status" SET DEFAULT 'PENDING'`,
    );
    await queryRunner.query(
      `ALTER TABLE "outbox_archive" ALTER COLUMN "status" SET DEFAULT 'PENDING'`,
    );

    // Outbox priority enum migration
    await queryRunner.query(
      `ALTER TABLE "outbox" ALTER COLUMN "priority" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."outbox_priority_enum" RENAME TO "outbox_priority_enum_old"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."outbox_priority_enum" AS ENUM('HIGH', 'MEDIUM', 'LOW')`,
    );
    await queryRunner.query(
      `ALTER TABLE "outbox" ALTER COLUMN "priority" TYPE "public"."outbox_priority_enum" USING "priority"::"text"::"public"."outbox_priority_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "outbox" ALTER COLUMN "priority" SET DEFAULT 'MEDIUM'`,
    );
    await queryRunner.query(`DROP TYPE "public"."outbox_priority_enum_old"`);

    // Auth provider enum
    await queryRunner.query(
      `ALTER TABLE "drivers" DROP COLUMN IF EXISTS "auth_provider"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."auth_provider_enum" AS ENUM('legacy', 'google', 'email')`,
    );
    await queryRunner.query(
      `ALTER TABLE "drivers" ADD "auth_provider" "public"."auth_provider_enum" NOT NULL DEFAULT 'legacy'`,
    );

    // Recreate outbox indexes
    await queryRunner.query(
      `CREATE INDEX "idx_outbox_worker" ON "outbox" ("status", "next_retry_at") WHERE (status = 'PENDING'::outbox_status_enum)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_outbox_locked" ON "outbox" ("locked_at") WHERE (status = 'PROCESSING'::outbox_status_enum)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_delivery_events_seller_order_id" ON "delivery_events" ("seller_order_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."idx_delivery_events_seller_order_id"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."idx_outbox_locked"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."idx_outbox_worker"`,
    );
    await queryRunner.query(
      `ALTER TABLE "drivers" DROP COLUMN IF EXISTS "auth_provider"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."auth_provider_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "drivers" ADD "auth_provider" character varying(255) NOT NULL DEFAULT 'legacy'`,
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
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."outbox_priority_enum"`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."outbox_priority_enum_old" RENAME TO "outbox_priority_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "outbox" ALTER COLUMN "status" DROP DEFAULT`,
    );
    await queryRunner.query(
      `ALTER TABLE "outbox_archive" ALTER COLUMN "status" DROP DEFAULT`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."outbox_status_enum_old" AS ENUM('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED')`,
    );
    await queryRunner.query(
      `ALTER TABLE "outbox" ALTER COLUMN "status" TYPE text USING "status"::text`,
    );
    await queryRunner.query(
      `ALTER TABLE "outbox_archive" ALTER COLUMN "status" TYPE text USING "status"::text`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."outbox_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "outbox" ALTER COLUMN "status" TYPE "public"."outbox_status_enum_old" USING "status"::"public"."outbox_status_enum_old"`,
    );
    await queryRunner.query(
      `ALTER TABLE "outbox_archive" ALTER COLUMN "status" TYPE "public"."outbox_status_enum_old" USING "status"::"public"."outbox_status_enum_old"`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."outbox_status_enum_old" RENAME TO "outbox_status_enum"`,
    );
    await queryRunner.query(
      `ALTER TABLE "outbox" ALTER COLUMN "status" SET DEFAULT 'PENDING'`,
    );
    await queryRunner.query(
      `ALTER TABLE "outbox_archive" ALTER COLUMN "status" SET DEFAULT 'PENDING'`,
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
    await queryRunner.query(
      `CREATE INDEX "idx_outbox_locked" ON "outbox" ("locked_at") WHERE (status = 'PROCESSING'::outbox_status_enum)`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_outbox_worker" ON "outbox" ("status", "next_retry_at") WHERE (status = 'PENDING'::outbox_status_enum)`,
    );
  }
}
