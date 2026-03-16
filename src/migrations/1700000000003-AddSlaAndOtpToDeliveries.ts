import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSlaAndOtpToDeliveries1700000000003 implements MigrationInterface {
  name = "AddSlaAndOtpToDeliveries1700000000003";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "deliveries" ADD COLUMN IF NOT EXISTS "expected_pickup_at" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "deliveries" ADD COLUMN IF NOT EXISTS "expected_delivery_at" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "deliveries" ADD COLUMN IF NOT EXISTS "sla_breach_at" TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE "deliveries" ADD COLUMN IF NOT EXISTS "delivery_otp" VARCHAR(6)`,
    );
    await queryRunner.query(
      `ALTER TABLE "deliveries" ADD COLUMN IF NOT EXISTS "otp_attempts" INTEGER NOT NULL DEFAULT 0`,
    );
    await queryRunner.query(
      `ALTER TABLE "deliveries" ADD COLUMN IF NOT EXISTS "otp_locked_until" TIMESTAMP`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_deliveries_expected_pickup_at" ON "deliveries" ("expected_pickup_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_deliveries_expected_delivery_at" ON "deliveries" ("expected_delivery_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_deliveries_sla_breach_at" ON "deliveries" ("sla_breach_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_deliveries_sla_breach_at"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_deliveries_expected_delivery_at"`,
    );
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_deliveries_expected_pickup_at"`,
    );

    await queryRunner.query(`
      ALTER TABLE "deliveries"
      DROP COLUMN "otp_locked_until",
      DROP COLUMN "otp_attempts",
      DROP COLUMN "delivery_otp",
      DROP COLUMN "sla_breach_at",
      DROP COLUMN "expected_delivery_at",
      DROP COLUMN "expected_pickup_at"
    `);
  }
}
