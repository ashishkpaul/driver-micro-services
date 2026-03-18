import { MigrationInterface, QueryRunner } from "typeorm";

export class SAFEAddDriverOfferColumns1773816386000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
     ALTER TABLE driver_offers
     ADD COLUMN accepted_at TIMESTAMP
    `);

    await queryRunner.query(`
     ALTER TABLE driver_offers
     ADD COLUMN rejected_at TIMESTAMP
    `);

    await queryRunner.query(`
     ALTER TABLE driver_offers
     ADD COLUMN rejection_reason TEXT
    `);

    await queryRunner.query(`
     ALTER TABLE driver_offers
     ADD COLUMN notification_sent_at TIMESTAMP
    `);

    await queryRunner.query(`
     ALTER TABLE driver_offers
     ADD COLUMN notification_method VARCHAR(20) DEFAULT 'push'
    `);

    await queryRunner.query(`
     ALTER TABLE driver_offers
     ADD COLUMN driver_response_time_ms INTEGER
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
     ALTER TABLE driver_offers DROP COLUMN accepted_at
    `);

    await queryRunner.query(`
     ALTER TABLE driver_offers DROP COLUMN rejected_at
    `);

    await queryRunner.query(`
     ALTER TABLE driver_offers DROP COLUMN rejection_reason
    `);

    await queryRunner.query(`
     ALTER TABLE driver_offers DROP COLUMN notification_sent_at
    `);

    await queryRunner.query(`
     ALTER TABLE driver_offers DROP COLUMN notification_method
    `);

    await queryRunner.query(`
     ALTER TABLE driver_offers DROP COLUMN driver_response_time_ms
    `);
  }
}
