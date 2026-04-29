import { MigrationInterface, QueryRunner } from "typeorm";

export class AddUniqueSellerOrderIdToDelivery1777462769161 implements MigrationInterface {
    name = 'AddUniqueSellerOrderIdToDelivery1777462769161'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Remove dispatch_decisions for duplicate deliveries first (FK constraint)
        await queryRunner.query(`
            DELETE FROM "dispatch_decisions"
            WHERE "delivery_id" IN (
                SELECT d1.id FROM "deliveries" d1
                INNER JOIN "deliveries" d2
                  ON d1."seller_order_id" = d2."seller_order_id"
                 AND d1."created_at" < d2."created_at"
            )
        `);
        // Remove duplicate deliveries, keeping the latest per sellerOrderId
        await queryRunner.query(`
            DELETE FROM "deliveries" d1
            USING "deliveries" d2
            WHERE d1."seller_order_id" = d2."seller_order_id"
              AND d1."created_at" < d2."created_at"
        `);
        await queryRunner.query(`ALTER TABLE "deliveries" ADD CONSTRAINT "UQ_deliveries_seller_order_id" UNIQUE ("seller_order_id")`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "deliveries" DROP CONSTRAINT "UQ_deliveries_seller_order_id"`);
    }
}
