import { MigrationInterface, QueryRunner } from "typeorm";

export class SAFEAddAdminUserLoginLockColumns1774801000000 implements MigrationInterface {
  name = "SAFEAddAdminUserLoginLockColumns1774801000000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE admin_users
      ADD COLUMN IF NOT EXISTS "failed_login_attempts" INTEGER NOT NULL DEFAULT 0
    `);

    await queryRunner.query(`
      ALTER TABLE admin_users
      ADD COLUMN IF NOT EXISTS "locked_until" TIMESTAMP NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE admin_users DROP COLUMN IF EXISTS "locked_until"
    `);
    await queryRunner.query(`
      ALTER TABLE admin_users DROP COLUMN IF EXISTS "failed_login_attempts"
    `);
  }
}
