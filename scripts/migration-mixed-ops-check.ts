#!/usr/bin/env ts-node
/**
 * migration-mixed-ops-check.ts  — NEW
 *
 * Detects migrations that mix operation categories in a single `up()` block:
 *
 *   Schema ops:  CREATE TABLE, CREATE INDEX, ALTER TABLE, ADD COLUMN, DROP ...
 *   Data ops:    INSERT, UPDATE, DELETE, COPY, BACKFILL (comment keyword)
 *   Constraint:  SET NOT NULL, ADD CONSTRAINT, ALTER TYPE
 *
 * Mixing these prevents the Expand → Migrate → Contract lifecycle pattern.
 * It also makes rollback unreliable: if the data phase succeeds but the
 * constraint phase fails, the database is in an inconsistent state.
 *
 * Exceptions:
 *   - BASELINE_ files: always contain both schema and seed data
 *   - Files with @allow-mixed-ops comment (requires explanation in the comment)
 */

import * as fs   from 'fs';
import * as path from 'path';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'src/migrations');
const CHECK_ALL      = process.env.MIGRATION_MIXED_CHECK_ALL === 'true';

// ── Operation classifiers ─────────────────────────────────────────────────────

const SCHEMA_OPS = [
  /\bCREATE\s+TABLE\b/i,
  /\bCREATE\s+INDEX\b/i,
  /\bCREATE\s+TYPE\b/i,
  /\bALTER\s+TABLE\b/i,
  /\bDROP\s+TABLE\b/i,
  /\bDROP\s+COLUMN\b/i,
  /\bDROP\s+INDEX\b/i,
  /\bDROP\s+TYPE\b/i,
  /\bRENAME\s+COLUMN\b/i,
  /\bRENAME\s+TABLE\b/i,
];

const DATA_OPS = [
  /\bINSERT\s+INTO\b/i,
  /\bUPDATE\s+\w/i,
  /\bDELETE\s+FROM\b/i,
  /\bTRUNCATE\b/i,
  // Backfill comment keywords
  /\/\/.*\bbackfill\b/i,
  /\/\*.*\bbackfill\b.*\*\//i,
];

const CONSTRAINT_OPS = [
  /\bSET\s+NOT\s+NULL\b/i,
  /\bADD\s+CONSTRAINT\b/i,
  /\bALTER\s+TYPE\b/i,
  /\bALTER\s+COLUMN\b/i,
];

function extractUpBlock(content: string): string {
  const m = content.match(
    /public\s+async\s+up\([^)]*\)\s*:\s*Promise<\s*void\s*>\s*\{([\s\S]*?)\n\s*\}\n\s*public\s+async\s+down/,
  );
  return m ? m[1] : content;
}

function stripComments(content: string): string {
  return content
    .replace(/--.*$/gm, '')
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');
}

function detectCategories(upBlock: string): { schema: boolean; data: boolean; constraint: boolean } {
  const stripped = stripComments(upBlock);
  // Also check the raw block for comment-based backfill markers
  return {
    schema:     SCHEMA_OPS.some((r) => r.test(stripped)),
    data:       DATA_OPS.some((r) => r.test(upBlock)), // raw — catches comment backfill markers
    constraint: CONSTRAINT_OPS.some((r) => r.test(stripped)),
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

function main(): void {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.log('✅ migration-mixed-ops-check: no migrations directory');
    return;
  }

  const allFiles = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.ts') && f !== 'index.ts')
    .sort();

  const filesToCheck = CHECK_ALL ? allFiles : allFiles.slice(-1);
  let failed = false;

  for (const filename of filesToCheck) {
    const filePath = path.join(MIGRATIONS_DIR, filename);
    const content  = fs.readFileSync(filePath, 'utf8');

    // BASELINE_ — exempt
    if (filename.includes('BASELINE_')) {
      console.log(`⏭️  ${filename}: exempt (BASELINE)`);
      continue;
    }

    // Explicit bypass with explanation
    if (content.includes('@allow-mixed-ops')) {
      console.log(`⏭️  ${filename}: exempt (@allow-mixed-ops)`);
      continue;
    }

    const upBlock = extractUpBlock(content);
    const cats    = detectCategories(upBlock);
    const activeCategories = Object.entries(cats)
      .filter(([, active]) => active)
      .map(([name]) => name);

    if (activeCategories.length > 1) {
      console.error(`❌ ${filename}: mixes ${activeCategories.join(' + ')} operations`);
      console.error(`
   Mixed operations prevent the Expand → Migrate → Contract lifecycle.
   Split into separate migrations:
     SAFE_   — schema expansions (ADD COLUMN, CREATE INDEX)
     DATA_   — data movement and backfills
     BREAKING_ — constraint enforcement (SET NOT NULL, DROP COLUMN)
   
   If this is intentional and reviewed, add: // @allow-mixed-ops: <reason>
`);
      failed = true;
    } else {
      console.log(`✅ ${filename}: single operation category`);
    }
  }

  if (failed) {
    console.error('❌ migration-mixed-ops-check failed');
    process.exit(1);
  }

  console.log('\n✅ migration-mixed-ops-check: no mixed operations detected');
}

main();
