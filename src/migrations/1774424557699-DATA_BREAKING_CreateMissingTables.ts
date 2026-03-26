import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * INTENT:    Cast data from "current_lat" to numeric
 * TYPE:      DATA
 * RISK:      MEDIUM
 * ROLLBACK:  SAFE
 *
 * CHECKLIST (mark [x] before merging):
 *   [ ] Data integrity verified on staging
 *   [ ] Batched for >10k rows (add @large-batch + loop)
 *   [ ] No schema changes mixed in
 *   [ ] Tested migration:revert locally
 *   [ ] Passes: npm run db:verify
 */

export class DATABREAKING_CreateMissingTables1774424557699 implements MigrationInterface {
  name = 'DATABREAKING_CreateMissingTables1774424557699';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      UPDATE "outbox" SET "current_lat_v2" = CAST("current_lat" AS numeric)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // TODO: Implement rollback logic
    throw new Error('Manual rollback required — see ROLLBACK PLAN in header');
  }
}
