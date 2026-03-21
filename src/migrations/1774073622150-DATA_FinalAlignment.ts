import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * INTENT:    Phase 10 of 47 — Column "status" requires backfill before NOT NULL can be enforced
 * TYPE:      DATA
 * RISK:      MEDIUM
 * ROLLBACK:  SAFE
 * *
 * CHECKLIST (mark [x] before merging):
 *   [ ] Data integrity verified on staging
 *   [ ] Batched for >10k rows (add @large-batch + loop)
 *   [ ] No schema changes mixed in
 *   [ ] Tested migration:revert locally
 *   [ ] Passes: npm run db:validate
 */

export class DATAFinalAlignment1774073622150 implements MigrationInterface {
  name = 'DATAFinalAlignment1774073622150';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      -- Backfill: set a safe default for every existing row before enforcing NOT NULL
UPDATE import SET "status" = <DEFAULT_VALUE> WHERE "status" IS NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // TODO: reverse the above — describe rollback in the header's ROLLBACK PLAN
    throw new Error('Manual rollback required — see ROLLBACK PLAN in header');
  }
}
