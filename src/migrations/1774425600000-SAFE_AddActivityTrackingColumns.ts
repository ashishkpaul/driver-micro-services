import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * INTENT:    Add missing activity tracking columns used by current entities/services
 * TYPE:      SAFE
 * RISK:      LOW
 * ROLLBACK:  SAFE
 * MIGRATION_GUARD:ALLOW_DESTRUCTIVE
 */

export class SAFEAddActivityTrackingColumns1774425600000 implements MigrationInterface {
  name = 'SAFEAddActivityTrackingColumns1774425600000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    const columns = [
      { table: 'drivers', column: 'last_location_update_at' },
      { table: 'drivers', column: 'last_status_update_at' },
      { table: 'deliveries', column: 'last_activity_update_at' },
    ];

    for (const { table, column } of columns) {
      const hasColumn = await queryRunner.hasColumn(table, column);
      if (!hasColumn) {
        await queryRunner.query(
          `ALTER TABLE "${table}" ADD COLUMN "${column}" timestamp`,
        );
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const columns = [
      { table: 'drivers', column: 'last_location_update_at' },
      { table: 'drivers', column: 'last_status_update_at' },
      { table: 'deliveries', column: 'last_activity_update_at' },
    ];

    for (const { table, column } of columns) {
      const hasColumn = await queryRunner.hasColumn(table, column);
      if (hasColumn) {
        await queryRunner.query(
          `ALTER TABLE "${table}" DROP COLUMN "${column}"`,
        );
      }
    }
  }
}