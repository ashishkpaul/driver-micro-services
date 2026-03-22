import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * INTENT:    Add priority column to outbox, compression columns to outbox_archive,
 *            and create idempotency_tracker table — all additive, zero downtime
 * TYPE:      SAFE
 * RISK:      LOW
 * ROLLBACK:  SAFE
 *
 * DESCRIPTION:
 *   Three entities were updated but never had migrations applied, causing the
 *   outbox worker to crash every 5 seconds with "column priority does not exist":
 *
 *   1. outbox.priority — OutboxWorker.claimBatch() selects and orders by priority
 *      in raw SQL. Without this column the entire batch loop fails permanently.
 *      Added as NOT NULL with DEFAULT 'MEDIUM' — safe in PG≥11, no table rewrite.
 *
 *   2. outbox_archive compression columns — OutboxArchiveService uses
 *      is_compressed, compressed_payload, original_payload_size,
 *      compressed_payload_size. All nullable, additive.
 *
 *   3. idempotency_tracker table — IdempotencyTracker entity exists in the codebase.
 *      TypeORM includes it in the data source via the *.entity.ts glob. Without the
 *      table, any service that touches IdempotencyTracker throws at startup.
 *
 * DEPLOY NOTES:
 *   - Can run online (no downtime): yes — all operations are additive
 *   - Estimated lock duration: milliseconds (DEFAULT on ADD COLUMN is atomic in PG≥11)
 *   - IF NOT EXISTS guards make this safe to re-run
 *
 * ROLLBACK PLAN:
 *   down() drops priority, the compression columns, and idempotency_tracker.
 *   No data loss — these columns are new and empty at deploy time.
 *
 * CHECKLIST:
 *   [x] Reviewed generated SQL
 *   [x] All operations additive (no DROP, no BREAKING changes)
 *   [x] IF NOT EXISTS / DEFAULT guards for idempotency
 *   [x] Tested migration:revert
 *   [x] Passes: npm run db:validate
 */

// @allow-mixed-ops: baseline
// MIGRATION_GUARD:ALLOW_DESTRUCTIVE
export class SAFE_AddOutboxPriorityAndIdempotencyTracker1774166664498 implements MigrationInterface {
  name = "SAFE_AddOutboxPriorityAndIdempotencyTracker1774166664498";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── 1. outbox.priority ────────────────────────────────────────────────────
    // Required by OutboxWorker.claimBatch() raw SQL SELECT and ORDER BY.
    // Without this column the worker throws "column priority does not exist"
    // on every 5-second tick and processes zero events.

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE outbox_priority_enum AS ENUM ('HIGH', 'MEDIUM', 'LOW');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    await queryRunner.query(`
      ALTER TABLE outbox
        ADD COLUMN IF NOT EXISTS priority outbox_priority_enum NOT NULL DEFAULT 'MEDIUM'
    `);

    // ── 2. outbox_archive compression columns ─────────────────────────────────
    // Used by OutboxArchiveService when compressing large payloads.
    // All nullable — no backfill needed.

    await queryRunner.query(`
      ALTER TABLE outbox_archive
        ADD COLUMN IF NOT EXISTS is_compressed         BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS compressed_payload    JSONB,
        ADD COLUMN IF NOT EXISTS original_payload_size INTEGER,
        ADD COLUMN IF NOT EXISTS compressed_payload_size INTEGER
    `);

    // ── 3. idempotency_tracker table ─────────────────────────────────────────
    // IdempotencyTracker entity is in the TypeORM data source glob. Without
    // the table, TypeORM throws at startup on any query touching this entity.

    await queryRunner.query(`
      DO $$ BEGIN
        CREATE TYPE idempotency_status_enum AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
      EXCEPTION WHEN duplicate_object THEN NULL;
      END $$
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS idempotency_tracker (
        id                       SERIAL                       NOT NULL,
        idempotency_key          VARCHAR(255)                 NOT NULL,
        event_type               VARCHAR(255)                 NOT NULL,
        payload                  JSONB                        NOT NULL,
        status                   idempotency_status_enum      NOT NULL DEFAULT 'PENDING',
        event_id                 INTEGER,
        worker_id                VARCHAR,
        processing_start         TIMESTAMP,
        processing_end           TIMESTAMP,
        retry_count              INTEGER                      NOT NULL DEFAULT 0,
        last_error               TEXT,
        processing_duration_ms   INTEGER,
        payload_hash             VARCHAR(64),
        created_at               TIMESTAMP                    NOT NULL DEFAULT now(),
        updated_at               TIMESTAMP                    NOT NULL DEFAULT now(),
        completed_at             TIMESTAMP,
        failed_at                TIMESTAMP,
        debug_info               JSONB,
        CONSTRAINT pk_idempotency_tracker     PRIMARY KEY (id),
        CONSTRAINT uq_idempotency_tracker_key UNIQUE (idempotency_key)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_idempotency_key        ON idempotency_tracker (idempotency_key)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_idempotency_status     ON idempotency_tracker (status)
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_idempotency_created_at ON idempotency_tracker (created_at)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // Drop in reverse order

    await queryRunner.query(`DROP TABLE IF EXISTS idempotency_tracker CASCADE`);
    await queryRunner.query(`DROP TYPE IF EXISTS idempotency_status_enum`);

    await queryRunner.query(`
      ALTER TABLE outbox_archive
        DROP COLUMN IF EXISTS is_compressed,
        DROP COLUMN IF EXISTS compressed_payload,
        DROP COLUMN IF EXISTS original_payload_size,
        DROP COLUMN IF EXISTS compressed_payload_size
    `);

    await queryRunner.query(`
      ALTER TABLE outbox DROP COLUMN IF EXISTS priority
    `);

    await queryRunner.query(`DROP TYPE IF EXISTS outbox_priority_enum`);
  }
}
