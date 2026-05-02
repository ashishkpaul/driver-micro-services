import { MigrationInterface, QueryRunner } from "typeorm";

export class SAFEAddSellerNameAddressToDelivery1777900000000
  implements MigrationInterface
{
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "public"."deliveries" ADD COLUMN IF NOT EXISTS "seller_name" varchar NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "public"."deliveries" ADD COLUMN IF NOT EXISTS "seller_address" varchar NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "public"."deliveries" DROP COLUMN IF EXISTS "seller_address"`,
    );
    await queryRunner.query(
      `ALTER TABLE "public"."deliveries" DROP COLUMN IF EXISTS "seller_name"`,
    );
  }
}
