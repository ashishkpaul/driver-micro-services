import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * INTENT:    Phase 15 of 47 — Enforce NOT NULL on "auth_provider" after data is backfilled
 * TYPE:      BREAKING
 * RISK:      HIGH
 * ROLLBACK:  DATA_LOSS
 * *
 * @approved-breaking: <REQUIRED — reviewer name + reason this is safe to deploy>
 *
 * CHECKLIST (mark [x] before merging):
 *   [ ] @approved-breaking filled in with reviewer name and reason
 *   [ ] All app code no longer references dropped/changed column
 *   [ ] Backward-compat layer deployed before this migration
 *   [ ] Coordinated deploy window with team
 *   [ ] Tested migration:revert locally
 *   [ ] Passes: npm run db:validate
 */

export class BREAKINGFinalAlignment1774073622155 implements MigrationInterface {
  name = 'BREAKINGFinalAlignment1774073622155';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "import" ALTER COLUMN "auth_provider" SET NOT NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // TODO: reverse the above — describe rollback in the header's ROLLBACK PLAN
    throw new Error('Manual rollback required — see ROLLBACK PLAN in header');
  }
}
