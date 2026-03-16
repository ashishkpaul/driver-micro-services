import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class AddGoogleAuthColumns1700000000002 implements MigrationInterface {
  name = "AddGoogleAuthColumns1700000000002";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add Google auth columns to drivers table (idempotent)
    if (!(await queryRunner.hasColumn("drivers", "email"))) {
      await queryRunner.addColumn(
        "drivers",
        new TableColumn({
          name: "email",
          type: "varchar",
          isNullable: true,
        }),
      );
    }

    if (!(await queryRunner.hasColumn("drivers", "google_sub"))) {
      await queryRunner.addColumn(
        "drivers",
        new TableColumn({
          name: "google_sub",
          type: "varchar",
          isNullable: true,
        }),
      );
    }

    if (!(await queryRunner.hasColumn("drivers", "auth_provider"))) {
      await queryRunner.addColumn(
        "drivers",
        new TableColumn({
          name: "auth_provider",
          type: "varchar",
          default: "'legacy'",
        }),
      );
    }

    // Create partial unique index for google_sub (only when not null)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_drivers_google_sub
      ON drivers (google_sub) 
      WHERE google_sub IS NOT NULL
    `);

    // Create partial unique index for email (only when not null)
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_drivers_email_unique 
      ON drivers (email) 
      WHERE email IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query("DROP INDEX IF EXISTS idx_drivers_google_sub");
    await queryRunner.query("DROP INDEX IF EXISTS idx_drivers_email_unique");

    // Drop columns
    if (await queryRunner.hasColumn("drivers", "email")) {
      await queryRunner.dropColumn("drivers", "email");
    }
    if (await queryRunner.hasColumn("drivers", "google_sub")) {
      await queryRunner.dropColumn("drivers", "google_sub");
    }
    if (await queryRunner.hasColumn("drivers", "auth_provider")) {
      await queryRunner.dropColumn("drivers", "auth_provider");
    }
  }
}
