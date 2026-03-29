// MIGRATION_GUARD:ALLOW_DESTRUCTIVE
// @allow-mixed-ops: Enum migrations require schema + constraint operations together
import { MigrationInterface, QueryRunner } from "typeorm";

export class SyncDriverRegistrationDispatchEnums1774762625056 implements MigrationInterface {
  name = "SyncDriverRegistrationDispatchEnums1774762625056";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Drop dispatch indexes
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."idx_dispatch_scores_driver_type"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."idx_dispatch_configs_type_scope"`,
    );

    // Dispatch decisions cohort enum
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

    // Dispatch decisions dispatch_method enum
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

    // Dispatch decisions dispatch_status enum
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

    // Dispatch scores score_type enum
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

    // Dispatch scores score_source enum
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

    // Dispatch configs config_type enum
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

    // Dispatch configs config_scope enum
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

    // Recreate indexes
    await queryRunner.query(
      `CREATE INDEX "idx_dispatch_scores_driver_type" ON "dispatch_scores" ("driver_id", "score_type")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_dispatch_configs_type_scope" ON "dispatch_configs" ("config_type", "config_scope")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_delivery_active_driver" ON "deliveries" ("driver_id", "status")`,
    );

    // Recreate foreign key constraints
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
      `ALTER TABLE "dispatch_decisions" DROP CONSTRAINT IF EXISTS "FK_007b249b21c0028d61d56fb1e30"`,
    );
    await queryRunner.query(
      `ALTER TABLE "dispatch_decisions" DROP CONSTRAINT IF EXISTS "FK_b7552521d7862ec66129d4e9799"`,
    );
    await queryRunner.query(
      `ALTER TABLE "schema_differences" DROP CONSTRAINT IF EXISTS "FK_62d5bd83cc3ff3524983f8f5129"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."idx_delivery_active_driver"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."idx_dispatch_configs_type_scope"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "public"."idx_dispatch_scores_driver_type"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."dispatch_configs_config_scope_enum_old" AS ENUM('GLOBAL', 'REGION', 'DRIVER_TYPE')`,
    );
    await queryRunner.query(
      `ALTER TABLE "dispatch_configs" ALTER COLUMN "config_scope" TYPE "public"."dispatch_configs_config_scope_enum_old" USING "config_scope"::"text"::"public"."dispatch_configs_config_scope_enum_old"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."dispatch_configs_config_scope_enum"`,
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
      `DROP TYPE IF EXISTS "public"."dispatch_configs_config_type_enum"`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."dispatch_configs_config_type_enum_old" RENAME TO "dispatch_configs_config_type_enum"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."dispatch_scores_score_source_enum_old" AS ENUM('DRIVER_STATS', 'DELIVERY_METRICS', 'MANUAL_ADJUSTMENT')`,
    );
    await queryRunner.query(
      `ALTER TABLE "dispatch_scores" ALTER COLUMN "score_source" TYPE "public"."dispatch_scores_score_source_enum_old" USING "score_source"::"text"::"public"."dispatch_scores_score_source_enum_old"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."dispatch_scores_score_source_enum"`,
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
      `DROP TYPE IF EXISTS "public"."dispatch_scores_score_type_enum"`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."dispatch_scores_score_type_enum_old" RENAME TO "dispatch_scores_score_type_enum"`,
    );
    await queryRunner.query(
      `CREATE TYPE "public"."dispatch_decisions_dispatch_status_enum_old" AS ENUM('PENDING', 'ASSIGNED', 'FAILED', 'TIMEOUT')`,
    );
    await queryRunner.query(
      `ALTER TABLE "dispatch_decisions" ALTER COLUMN "dispatch_status" TYPE "public"."dispatch_decisions_dispatch_status_enum_old" USING "dispatch_status"::"text"::"public"."dispatch_decisions_dispatch_status_enum_old"`,
    );
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."dispatch_decisions_dispatch_status_enum"`,
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
      `DROP TYPE IF EXISTS "public"."dispatch_decisions_dispatch_method_enum"`,
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
      `DROP TYPE IF EXISTS "public"."dispatch_decisions_cohort_enum"`,
    );
    await queryRunner.query(
      `ALTER TYPE "public"."dispatch_decisions_cohort_enum_old" RENAME TO "dispatch_decisions_cohort_enum"`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_dispatch_configs_type_scope" ON "dispatch_configs" ("config_type", "config_scope")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_dispatch_scores_driver_type" ON "dispatch_scores" ("driver_id", "score_type")`,
    );
  }
}
