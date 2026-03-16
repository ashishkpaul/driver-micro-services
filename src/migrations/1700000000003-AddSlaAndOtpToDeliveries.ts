import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSlaAndOtpToDeliveries1700000000003
  implements MigrationInterface
{
  name = "AddSlaAndOtpToDeliveries1700000000003";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "deliveries"
      ADD COLUMN "expected_pickup_at" TIMESTAMP,
      ADD COLUMN "expected_delivery_at" TIMESTAMP,
      ADD COLUMN "sla_breach_at" TIMESTAMP,
      ADD COLUMN "delivery_otp" VARCHAR(6),
      ADD COLUMN "otp_attempts" INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN "otp_locked_until" TIMESTAMP
    `);

    await queryRunner.query(
      `CREATE INDEX "idx_deliveries_expected_pickup_at" ON "deliveries" ("expected_pickup_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_deliveries_expected_delivery_at" ON "deliveries" ("expected_delivery_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "idx_deliveries_sla_breach_at" ON "deliveries" ("sla_breach_at")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "idx_deliveries_sla_breach_at"`);
    await queryRunner.query(`DROP INDEX "idx_deliveries_expected_delivery_at"`);
    await queryRunner.query(`DROP INDEX "idx_deliveries_expected_pickup_at"`);

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
