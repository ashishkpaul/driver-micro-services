import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * INTENT:    <one sentence — what this migration achieves>
 * TYPE:      SAFE | DATA | BREAKING | FIX | BASELINE
 * RISK:      LOW | MEDIUM | HIGH
 * ROLLBACK:  SAFE | DATA_LOSS | IRREVERSIBLE
 *
 * DESCRIPTION:
 *   <2-4 sentences explaining the business reason and the approach>
 *
 * EXPAND → MIGRATE → CONTRACT phase: <which phase is this?>
 *   e.g. "Phase 1 of 3 — adds nullable column before backfill"
 *
 * DEPLOY NOTES:
 *   - Can this run online (no downtime)? <yes/no + reason>
 *   - Estimated lock duration: <seconds, or "none" for concurrent ops>
 *   - Dependent services that must be deployed first: <list or "none">
 *   - Dependent migrations that must have run first: <list or "none">
 *
 * ROLLBACK PLAN:
 *   The down() method reverses this change by: <explain what down() does>
 *   Data safety on rollback: <"no data lost" | "data written during window is lost" | "irreversible">
 *
 * BREAKING_ ONLY — remove this block for other types:
 *   @approved-breaking: <reviewer name + reason this is safe to deploy>
 *
 * CHECKLIST (mark with [x] before merging):
 *   [ ] Reviewed generated SQL — not just the TypeScript
 *   [ ] Tested migration:run on a production-sized dataset locally or in staging
 *   [ ] Tested migration:revert — down() actually works
 *   [ ] Passes all db:validate checks locally
 *   [ ] Does not mix schema + data operations in one file
 *   [ ] Uses CREATE INDEX CONCURRENTLY if adding indexes to large tables
 *   [ ] All WHERE clauses present on any DELETE statements
 */
export class __MIGRATION_CLASS_NAME__0 implements MigrationInterface {
  name = '__MIGRATION_CLASS_NAME__0';

  // Remove if migration does not use CONCURRENTLY index operations.
  // Required when CONCURRENTLY is used — PostgreSQL rejects it inside a transaction.
  // public transaction = false;

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── <describe what this block does> ──────────────────────────────────
    await queryRunner.query(`
      -- TODO: replace with actual SQL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Reverse of up() — must leave the database in the exact state
    // it was in before up() ran.
    await queryRunner.query(`
      -- TODO: replace with actual rollback SQL
    `);
  }
}
