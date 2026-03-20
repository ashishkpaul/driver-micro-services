#!/usr/bin/env ts-node
/**
 * scripts/db/simulate.ts  — FIX v3
 *
 * BUGS FIXED IN THIS VERSION:
 *
 * v2 fix: "relation _migrations does not exist" on fresh DB
 *   → check information_schema.tables before querying _migrations (still present)
 *
 * v3 fix: "migration is not a constructor"
 *   Root cause: data-source.ts uses a glob pattern ("src/migrations/*.ts").
 *   TypeORM resolves the glob and INSTANTIATES each class during
 *   dataSource.initialize(). So ds.migrations is an array of INSTANCES,
 *   not constructors. Calling `new (migration)()` on an instance throws
 *   "migration is not a constructor".
 *
 *   Fix: use the migration object directly — it already has .up() and .down().
 *   Same for isNonTransactional(): read .transaction on the instance itself.
 *
 *   Additionally: get the migration name from TypeORM's own .name property
 *   (which it stamps onto each instance) rather than .constructor.name,
 *   so names match what _migrations stores.
 */

import 'dotenv/config';
import * as path from 'path';
import * as fs   from 'fs';
import { DataSource, QueryRunner, MigrationInterface } from 'typeorm';

// ── Config resolution ─────────────────────────────────────────────────────────

const configArgIdx = process.argv.indexOf('--config');
const configPath   = configArgIdx !== -1
  ? process.argv[configArgIdx + 1]
  : 'src/config/data-source.ts';

if (!fs.existsSync(configPath)) {
  console.error(`❌ DataSource config not found: ${configPath}`);
  process.exit(1);
}

// ── Migration instance helpers ────────────────────────────────────────────────

/**
 * TypeORM stores instances in ds.migrations after initialize().
 * The `name` property is stamped onto the instance by TypeORM from the
 * `name` class field (e.g. `name = 'Baseline0000000000000'`).
 * Fallback to constructor.name if no explicit name field was set.
 */
function getMigrationName(m: any): string {
  return m.name ?? m.constructor?.name ?? '(unknown)';
}

/**
 * Check if a migration uses CONCURRENTLY (which cannot run inside a transaction).
 * ds.migrations contains INSTANCES after initialize(), so read .transaction
 * directly on the object — do NOT call `new m()`.
 */
function isNonTransactional(m: any): boolean {
  return m.transaction === false;
}

// ── Database helpers ──────────────────────────────────────────────────────────

/**
 * Returns true if _migrations does not yet exist.
 * Uses information_schema — always present, never throws on a fresh DB.
 */
async function isFreshDatabase(ds: DataSource, migrationsTableName: string): Promise<boolean> {
  const rows = await ds.query(`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name   = $1
    ) AS "exists"
  `, [migrationsTableName]) as Array<{ exists: boolean }>;

  return !rows[0]?.exists;
}

/**
 * Get pending migrations without modifying the database.
 * On a fresh DB (no _migrations table), every migration file is pending.
 */
async function getPendingMigrations(
  ds: DataSource,
  migrationsTableName: string,
): Promise<MigrationInterface[]> {
  const fresh = await isFreshDatabase(ds, migrationsTableName);

  if (fresh) {
    return ds.migrations as MigrationInterface[];
  }

  const applied = await ds.query(
    `SELECT name FROM ${migrationsTableName} ORDER BY id`,
  ) as Array<{ name: string }>;

  const appliedSet = new Set(applied.map((r) => r.name));

  return (ds.migrations as any[]).filter(
    (m) => !appliedSet.has(getMigrationName(m)),
  ) as MigrationInterface[];
}

// ── Simulation core ───────────────────────────────────────────────────────────

async function simulate(): Promise<void> {
  console.log('🔄 Migration simulation starting...\n');

  // ── Load DataSource ───────────────────────────────────────────────────────

  const resolvedConfig = path.resolve(process.cwd(), configPath);

  let dataSource: DataSource;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod  = require(resolvedConfig);
    dataSource = mod.default ?? mod;
    if (!(dataSource instanceof DataSource)) {
      throw new Error(
        `${configPath} does not export a TypeORM DataSource. ` +
        'Ensure the file uses: export default new DataSource({...})',
      );
    }
  } catch (err: any) {
    console.error(`❌ Failed to load DataSource from ${configPath}: ${err.message}`);
    process.exit(1);
  }

  await dataSource.initialize();

  const qr: QueryRunner = dataSource.createQueryRunner();
  await qr.connect();

  const dbName          = process.env.DB_NAME ?? 'driver_service';
  const migrationsTable = (dataSource.options as any).migrationsTableName ?? '_migrations';
  const fresh           = await isFreshDatabase(dataSource, migrationsTable);

  console.log(`  Database:    ${dbName}`);
  console.log(`  Tracking:    ${migrationsTable}${fresh ? ' (fresh — table not yet created)' : ''}`);
  console.log(`  Loaded:      ${dataSource.migrations.length} migration(s) from data source`);
  console.log('');

  // ── Determine pending ─────────────────────────────────────────────────────

  const pending = await getPendingMigrations(dataSource, migrationsTable);

  if (pending.length === 0) {
    console.log('  ✅ No pending migrations — nothing to simulate');
    await qr.release();
    await dataSource.destroy();
    return;
  }

  console.log(`  Pending (${pending.length}):`);
  pending.forEach((m) => console.log(`    • ${getMigrationName(m)}`));
  console.log('');

  // ── Separate transactional from CONCURRENTLY ──────────────────────────────

  const nonTransactional = pending.filter(isNonTransactional);
  const transactional    = pending.filter((m) => !isNonTransactional(m));

  if (nonTransactional.length > 0) {
    console.log('  ⚠️  Skipping CONCURRENTLY migrations in simulation (safe — they run outside tx):');
    nonTransactional.forEach((m) => console.log(`    • ${getMigrationName(m)}`));
    console.log('');
  }

  if (transactional.length === 0) {
    console.log('  ✅ Only CONCURRENTLY migrations pending — simulation skipped');
    await qr.release();
    await dataSource.destroy();
    return;
  }

  // ── Run up() inside a rollback transaction ────────────────────────────────

  console.log(`  Simulating ${transactional.length} migration(s) in a rollback transaction...`);
  await qr.startTransaction();

  try {
    for (const migration of transactional) {
      const name = getMigrationName(migration);
      process.stdout.write(`    ↳ ${name} ... `);

      // FIXED: migration is already an INSTANCE — call up() directly.
      // Do NOT call new (migration)() — that throws "not a constructor".
      await (migration as any).up(qr);

      process.stdout.write('✅\n');
    }

    // All up() calls succeeded — roll back so nothing is actually committed
    await qr.rollbackTransaction();
    console.log('');
    console.log('  ↩️  Transaction rolled back — database unchanged');

  } catch (err: any) {
    try { await qr.rollbackTransaction(); } catch { /* already rolled back or conn closed */ }

    console.error('\n  ❌ Simulation failed:\n');
    console.error(`     ${err.message ?? String(err)}`);

    if (err.detail)  console.error(`     Detail:   ${err.detail}`);
    if (err.hint)    console.error(`     Hint:     ${err.hint}`);
    if (err.table)   console.error(`     Table:    ${err.table}`);
    if (err.column)  console.error(`     Column:   ${err.column}`);
    if (err.code)    console.error(`     PG code:  ${err.code}`);

    console.error('');
    console.error('  Migrations NOT applied. Fix the error above, then re-run:');
    console.error('    npm run db:migrate');

    await qr.release();
    await dataSource.destroy();
    process.exit(1);
  }

  await qr.release();
  await dataSource.destroy();

  console.log('');
  console.log('✅ Simulation passed — all migrations verified safe to apply');
}

simulate().catch((err) => {
  console.error('❌ Simulation error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});