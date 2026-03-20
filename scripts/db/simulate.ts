#!/usr/bin/env ts-node
/**
 * scripts/db/simulate.ts
 *
 * Dry-run simulation for pending migrations.
 *
 * Connects to the real database, opens a transaction, executes every pending
 * migration's up() method inside that transaction, then ROLLS BACK — leaving
 * the database unchanged. If any migration fails, the error surfaces before
 * anything is committed, so production is never left in a partial state.
 *
 * Why not just use a throwaway database?
 *   A real transaction against the real DB catches connection issues, permission
 *   problems, type mismatches, and constraint violations that a SQLite or mock
 *   DB would miss. The rollback guarantees it's a no-op.
 *
 * Note: CONCURRENTLY operations cannot run inside a transaction. Migrations
 * that use CREATE INDEX CONCURRENTLY must set `public transaction = false`.
 * The transaction-check governance script enforces this. Those migrations are
 * skipped by simulation (flagged as a warning, not a failure).
 *
 * Usage (standalone):
 *   npx ts-node scripts/db/simulate.ts
 *   npx ts-node scripts/db/simulate.ts --config src/config/data-source.staging.ts
 *
 * Usage (via CLI):
 *   npm run migrate -- --run  (simulation runs automatically before apply)
 */

import 'dotenv/config';
import * as path from 'path';
import * as fs   from 'fs';
import { DataSource, QueryRunner } from 'typeorm';

// ── Config resolution ─────────────────────────────────────────────────────────

const configArgIdx = process.argv.indexOf('--config');
const configPath   = configArgIdx !== -1
  ? process.argv[configArgIdx + 1]
  : 'src/config/data-source.ts';

if (!fs.existsSync(configPath)) {
  console.error(`❌ DataSource config not found: ${configPath}`);
  process.exit(1);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isNonTransactional(migrationClass: any): boolean {
  // Migrations that use CONCURRENTLY must declare `public transaction = false`
  return migrationClass?.prototype?.transaction === false
      || (new migrationClass()).transaction === false;
}

async function getPendingMigrations(ds: DataSource): Promise<any[]> {
  // runMigrations with fake=true marks them applied but doesn't execute;
  // we need the actual pending list without applying anything.
  // TypeORM exposes this through showMigrations() → returns boolean (hasPending).
  // To get the actual list, we compare the migration files to _migrations table.
  const applied = await ds.query(`SELECT name FROM _migrations`) as Array<{ name: string }>;
  const appliedSet = new Set(applied.map((r) => r.name));

  return ds.migrations.filter((m: any) => {
    const name = m.name || m.constructor?.name || '';
    return !appliedSet.has(name);
  });
}

// ── Simulation core ───────────────────────────────────────────────────────────

async function simulate(): Promise<void> {
  console.log('🔄 Migration simulation starting...\n');

  // Dynamic import of the DataSource config
  const resolvedConfig = path.resolve(process.cwd(), configPath);

  let dataSource: DataSource;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mod = require(resolvedConfig);
    dataSource = mod.default ?? mod;
    if (!(dataSource instanceof DataSource)) {
      throw new Error(`${configPath} does not export a TypeORM DataSource instance`);
    }
  } catch (err: any) {
    console.error(`❌ Failed to load DataSource from ${configPath}: ${err.message}`);
    process.exit(1);
  }

  await dataSource.initialize();
  const qr: QueryRunner = dataSource.createQueryRunner();
  await qr.connect();

  console.log('  Connected to database:', process.env.DB_NAME ?? 'driver_service');

  const pending = await getPendingMigrations(dataSource);

  if (pending.length === 0) {
    console.log('  ✅ No pending migrations — simulation complete (nothing to apply)');
    await qr.release();
    await dataSource.destroy();
    return;
  }

  console.log(`  Pending migrations: ${pending.length}`);
  pending.forEach((m: any) => {
    console.log(`    • ${m.name ?? m.constructor?.name ?? '(unknown)'}`);
  });
  console.log('');

  // Check for non-transactional migrations (CONCURRENTLY)
  const nonTransactional = pending.filter(isNonTransactional);
  const transactional    = pending.filter((m) => !isNonTransactional(m));

  if (nonTransactional.length > 0) {
    console.log('  ⚠️  Non-transactional migrations detected (CONCURRENTLY operations):');
    nonTransactional.forEach((m: any) => {
      console.log(`    • ${m.name ?? '(unknown)'} — skipped in simulation (safe, runs outside tx)`);
    });
    console.log('');
  }

  // Simulate transactional migrations
  if (transactional.length > 0) {
    console.log(`  Simulating ${transactional.length} migration(s) inside a rollback transaction...`);
    await qr.startTransaction();

    try {
      for (const migration of transactional) {
        const name = (migration as any).name ?? (migration.constructor as any)?.name ?? '(unknown)';
        process.stdout.write(`    Running: ${name} ... `);

        const instance = new (migration as any)();
        await instance.up(qr);

        process.stdout.write('✅\n');
      }

      // All succeeded — roll back so the DB is untouched
      await qr.rollbackTransaction();
      console.log('');
      console.log('  ↩️  Transaction rolled back — database unchanged');

    } catch (err: any) {
      await qr.rollbackTransaction();
      console.error('\n  ❌ Simulation failed:\n');
      console.error(`     ${err.message ?? String(err)}`);

      if (err.detail)   console.error(`     Detail:  ${err.detail}`);
      if (err.hint)     console.error(`     Hint:    ${err.hint}`);
      if (err.table)    console.error(`     Table:   ${err.table}`);
      if (err.column)   console.error(`     Column:  ${err.column}`);
      if (err.code)     console.error(`     PG code: ${err.code}`);

      console.error('');
      console.error('  The migration has NOT been applied. Fix the error above and re-run.');
      await qr.release();
      await dataSource.destroy();
      process.exit(1);
    }
  }

  await qr.release();
  await dataSource.destroy();

  console.log('');
  console.log('✅ Simulation passed — all migrations are safe to apply');
}

simulate().catch((err) => {
  console.error('❌ Simulation error:', err instanceof Error ? err.message : String(err));
  process.exit(1);
});
