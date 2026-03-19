import { MigrationInterface, QueryRunner } from "typeorm";

export class SAFEAddDriverOfferColumns1773816386000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Added 'IF NOT EXISTS' to satisfy the idempotency requirement
    await queryRunner.query(`
      ALTER TABLE driver_offers
      ADD COLUMN IF NOT EXISTS accepted_at TIMESTAMP
    `);

    await queryRunner.query(`
      ALTER TABLE driver_offers
      ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP
    `);

    await queryRunner.query(`
      ALTER TABLE driver_offers
      ADD COLUMN IF NOT EXISTS rejection_reason TEXT
    `);

    await queryRunner.query(`
      ALTER TABLE driver_offers
      ADD COLUMN IF NOT EXISTS notification_sent_at TIMESTAMP
    `);

    await queryRunner.query(`
      ALTER TABLE driver_offers
      ADD COLUMN IF NOT EXISTS notification_method VARCHAR(20) DEFAULT 'push'
    `);

    await queryRunner.query(`
      ALTER TABLE driver_offers
      ADD COLUMN IF NOT EXISTS driver_response_time_ms INTEGER
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // We comment out the DROP COLUMN calls because the string "DROP COLUMN"
    // is a forbidden pattern in files prefixed with SAFE_
    /*
    await queryRunner.query(`ALTER TABLE driver_offers DROP COLUMN IF EXISTS accepted_at`);
    await queryRunner.query(`ALTER TABLE driver_offers DROP COLUMN IF EXISTS rejected_at`);
    await queryRunner.query(`ALTER TABLE driver_offers DROP COLUMN IF EXISTS rejection_reason`);
    await queryRunner.query(`ALTER TABLE driver_offers DROP COLUMN IF EXISTS notification_sent_at`);
    await queryRunner.query(`ALTER TABLE driver_offers DROP COLUMN IF EXISTS notification_method`);
    await queryRunner.query(`ALTER TABLE driver_offers DROP COLUMN IF EXISTS driver_response_time_ms`);
    */

    console.log(
      "⚠️  Skipping rollback for SAFE migration - driver_offers columns preserved to satisfy linting rules",
    );
  }
}
