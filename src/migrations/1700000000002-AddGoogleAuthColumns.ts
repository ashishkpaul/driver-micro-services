import { MigrationInterface, QueryRunner, TableColumn, TableIndex } from 'typeorm';

export class AddGoogleAuthColumns1700000000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add Google auth columns to drivers table
    await queryRunner.addColumns('drivers', [
      new TableColumn({
        name: 'email',
        type: 'varchar',
        isNullable: true,
      }),
      new TableColumn({
        name: 'google_sub',
        type: 'varchar',
        isNullable: true,
      }),
      new TableColumn({
        name: 'auth_provider',
        type: 'varchar',
        default: "'legacy'",
      }),
    ]);

    // Create partial unique index for google_sub (only when not null)
    await queryRunner.query(`
      CREATE UNIQUE INDEX idx_drivers_google_sub
      ON drivers (google_sub) 
      WHERE google_sub IS NOT NULL
    `);

    // Create partial unique index for email (only when not null)
    await queryRunner.query(`
      CREATE UNIQUE INDEX idx_drivers_email_unique 
      ON drivers (email) 
      WHERE email IS NOT NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop indexes
    await queryRunner.query('DROP INDEX IF EXISTS idx_drivers_google_sub');
    await queryRunner.query('DROP INDEX IF EXISTS idx_drivers_email_unique');

    // Drop columns
    await queryRunner.dropColumns('drivers', ['email', 'google_sub', 'auth_provider']);
  }
}