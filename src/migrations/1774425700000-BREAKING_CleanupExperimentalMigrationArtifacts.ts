import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * INTENT:    Remove deprecated experimental columns after schema stabilization
 * TYPE:      CONTRACT
 * RISK:      LOW
 * ROLLBACK:  NONE
 * MIGRATION_GUARD:ALLOW_DESTRUCTIVE
 */

export class BREAKINGCleanupExperimentalMigrationArtifacts1774425700000 implements MigrationInterface {
  name = 'BREAKINGCleanupExperimentalMigrationArtifacts1774425700000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const columnsToRemove = [
      'current_lat_v2',
      'current_lon_v2',
      'last_lat_v2',
      'last_lon_v2',
    ];

    for (const columnName of columnsToRemove) {
      const exists = await queryRunner.hasColumn('drivers', columnName);
      
      if (!exists) {
        continue;
      }

      console.log(`[SchemaCleanup] Removing deprecated column: ${columnName}`);
      
      await queryRunner.query(`
        ALTER TABLE drivers
        DROP COLUMN "${columnName}"
      `);
    }
  }

  public async down(): Promise<void> {
    // No rollback intentionally
  }
}
