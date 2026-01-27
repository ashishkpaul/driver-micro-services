import { MigrationInterface, QueryRunner } from "typeorm";

export class AddDriverIsActive1769489778198 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "drivers"
      ADD COLUMN "is_active" boolean NOT NULL DEFAULT true
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "drivers"
      DROP COLUMN "is_active"
    `);
  }
}
