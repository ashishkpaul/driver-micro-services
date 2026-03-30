import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * INTENT:    Add driver registration lifecycle columns
 * TYPE:      SAFE
 * RISK:      LOW
 * ROLLBACK:  SAFE
 * *
 * CHECKLIST (mark [x] before merging):
 *   [ ] Reviewed generated SQL (not just the TypeScript)
 *   [ ] Uses IF NOT EXISTS / IF EXISTS for idempotency
 *   [ ] New indexes use CONCURRENTLY + transaction = false
 *   [ ] Tested migration:revert locally
 *   [ ] Passes: npm run db:validate
 */
// MIGRATION_GUARD:ALLOW_DESTRUCTIVE

export class SAFEDriverRegistrationStatus1774800000000 implements MigrationInterface {
  name = "SAFEDriverRegistrationStatus1774800000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Create enum type for driver registration status
    await queryRunner.query(
      `CREATE TYPE "public"."driver_registration_status_enum" AS ENUM('PROFILE_INCOMPLETE', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED')`,
    );

    // Add registration_status column with default PROFILE_INCOMPLETE for new drivers
    await queryRunner.query(
      `ALTER TABLE "drivers" ADD "registration_status" "public"."driver_registration_status_enum" NOT NULL DEFAULT 'PROFILE_INCOMPLETE'`,
    );

    // Add approvedAt column
    await queryRunner.query(
      `ALTER TABLE "drivers" ADD "approved_at" TIMESTAMP`,
    );

    // Add approvedById column
    await queryRunner.query(`ALTER TABLE "drivers" ADD "approved_by_id" uuid`);

    // Add rejectionReason column
    await queryRunner.query(
      `ALTER TABLE "drivers" ADD "rejection_reason" character varying`,
    );

    // Set existing drivers to APPROVED (they were created before this migration)
    await queryRunner.query(
      `UPDATE "drivers" SET "registration_status" = 'APPROVED' WHERE "registration_status" = 'PROFILE_INCOMPLETE'`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop columns
    await queryRunner.query(
      `ALTER TABLE "drivers" DROP COLUMN IF EXISTS "rejection_reason"`,
    );
    await queryRunner.query(
      `ALTER TABLE "drivers" DROP COLUMN IF EXISTS "approved_by_id"`,
    );
    await queryRunner.query(
      `ALTER TABLE "drivers" DROP COLUMN IF EXISTS "approved_at"`,
    );
    await queryRunner.query(
      `ALTER TABLE "drivers" DROP COLUMN IF EXISTS "registration_status"`,
    );

    // Drop enum type
    await queryRunner.query(
      `DROP TYPE IF EXISTS "public"."driver_registration_status_enum"`,
    );
  }
}
