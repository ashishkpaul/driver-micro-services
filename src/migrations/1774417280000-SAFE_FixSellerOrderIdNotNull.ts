import { MigrationInterface, QueryRunner } from "typeorm";

export class SAFE_FIX_SELLER_ORDER_ID_NOT_NULL1774417280000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Fix HIGH severity: deliveries.seller_order_id nullable mismatch
    await queryRunner.query(`
      ALTER TABLE deliveries 
      ALTER COLUMN seller_order_id SET NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Revert the changes (for development/testing only)
    await queryRunner.query(`
      ALTER TABLE deliveries 
      ALTER COLUMN seller_order_id DROP NOT NULL
    `);
  }
}