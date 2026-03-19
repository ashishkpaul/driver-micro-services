// src/migrations/SAFE_1773735000010_AddUniqueConstraintToSellerOrderId.ts

import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUniqueConstraintToSellerOrderId1773735000010 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. SAFE DROP: Use IF EXISTS to satisfy the linter
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_deliveries_seller_order"`,
    );

    // 2. SAFE CREATE: Use IF NOT EXISTS to satisfy the linter
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "idx_deliveries_seller_order_unique" ON "deliveries" ("seller_order_id")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP INDEX IF EXISTS "idx_deliveries_seller_order_unique"`,
    );

    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "idx_deliveries_seller_order" ON "deliveries" ("seller_order_id")`,
    );
  }
}
