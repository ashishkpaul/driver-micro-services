import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * INTENT:    Remove old column and rename temp column to "current_lat"
 * TYPE:      BREAKING
 * RISK:      HIGH
 * ROLLBACK:  DATA_LOSS
 *
 * @approved-breaking: <REQUIRED — reviewer name + reason this is safe to deploy>
 *
 * CHECKLIST (mark [x] before merging):
 *   [ ] @approved-breaking filled in with reviewer name and reason
 *   [ ] All app code no longer references dropped/changed column
 *   [ ] Backward-compat layer deployed before this migration
 *   [ ] Coordinated deploy window with team
 *   [ ] Tested migration:revert locally
 *   [ ] Passes: npm run db:verify
 */

export class BREAKINGBREAKING_CreateMissingTables1774424557700 implements MigrationInterface {
  name = 'BREAKINGBREAKING_CreateMissingTables1774424557700';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "outbox" DROP COLUMN "current_lat"; ALTER TABLE "outbox" RENAME COLUMN "current_lat_v2" TO "current_lat"
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // TODO: Implement rollback logic
    throw new Error('Manual rollback required — see ROLLBACK PLAN in header');
  }
}
