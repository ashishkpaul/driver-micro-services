#!/usr/bin/env ts-node
/**
 * migration-size-check.ts  — NEW
 *
 * Rejects migrations that exceed MAX_LINES lines (default 500).
 *
 * Why: Large migrations become unreviewable, hard to rollback, and increase
 * table-lock duration. Split large migrations across multiple files.
 *
 * Override for BASELINE_ files — they are intentionally large by design.
 * Also exempt: DATA_ batch migrations that are documented with @large-batch.
 */

import * as fs   from 'fs';
import * as path from 'path';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'src/migrations');
const MAX_LINES      = parseInt(process.env.MIGRATION_MAX_LINES || '500', 10);
const CHECK_ALL      = process.env.MIGRATION_SIZE_CHECK_ALL === 'true';

function main(): void {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.log('✅ migration-size-check: no migrations directory');
    return;
  }

  const allFiles = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.ts') && f !== 'index.ts')
    .sort((a, b) => a.localeCompare(b));

  const filesToCheck = CHECK_ALL ? allFiles : allFiles.slice(-1);
  let failed = false;

  for (const filename of filesToCheck) {
    const filePath = path.join(MIGRATIONS_DIR, filename);
    const content  = fs.readFileSync(filePath, 'utf8');
    const lines    = content.split('\n').length;

    // BASELINE_ files are exempt — they define the entire schema
    if (filename.includes('BASELINE_')) {
      console.log(`⏭️  ${filename}: exempt (BASELINE)`);
      continue;
    }

    // DATA_ files with @large-batch comment are exempt (documented batch backfills)
    if (filename.includes('DATA_') && content.includes('@large-batch')) {
      console.log(`⏭️  ${filename}: exempt (@large-batch)`);
      continue;
    }

    if (lines > MAX_LINES) {
      console.error(`❌ ${filename}: ${lines} lines exceeds limit of ${MAX_LINES}`);
      console.error(
        `   Split this migration into multiple focused files.\n` +
        `   Tip: separate schema changes, data backfills, and constraint enforcement.\n` +
        `   Tip: for large DATA_ backfills, add @large-batch comment and split into batches.`,
      );
      failed = true;
    } else {
      console.log(`✅ ${filename}: ${lines} lines`);
    }
  }

  if (failed) {
    console.error(`\n❌ migration-size-check failed (limit: ${MAX_LINES} lines)`);
    process.exit(1);
  }

  console.log('\n✅ migration-size-check: all migrations within size limit');
}

main();
