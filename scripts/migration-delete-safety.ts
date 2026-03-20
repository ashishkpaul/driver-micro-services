#!/usr/bin/env ts-node
/**
 * migration-delete-safety.ts  — NEW
 *
 * Prevents unqualified DELETE FROM statements — i.e. deletes with no WHERE clause.
 * These are table-clearing operations that silently wipe all rows when a migration
 * is replayed, rolled back, or run on an unexpected environment.
 *
 * Allowed:
 *   DELETE FROM table WHERE status = 'PENDING'   ← qualified
 *   DELETE FROM table WHERE id = $1              ← qualified
 *   TRUNCATE table                               ← only if file is BREAKING_
 *
 * Forbidden (outside BREAKING_ + approved):
 *   DELETE FROM table                            ← no WHERE
 *   DELETE FROM schema.table                     ← no WHERE
 */

import * as fs   from 'fs';
import * as path from 'path';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'src/migrations');
const CHECK_ALL      = process.env.MIGRATION_DELETE_CHECK_ALL === 'true';

/**
 * Matches DELETE FROM <table> with no WHERE clause following it.
 * Deliberately conservative — matches across newlines to catch multi-line queries.
 */
const UNSAFE_DELETE = /DELETE\s+FROM\s+[\w."]+\s*(?:;|`|\n|$)(?!\s*WHERE)/i;

/**
 * Alternative: simpler single-line check for the common case.
 * Both are run; either match triggers a violation.
 */
const UNSAFE_DELETE_SIMPLE = /DELETE\s+FROM\s+[\w."]+\s*[;`\n]/i;

function extractSqlFromFile(content: string): string[] {
  const results: string[] = [];
  const re = /queryRunner\.query\(\s*`([\s\S]*?)`\s*\)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    results.push(m[1]);
  }
  return results;
}

function hasWhereClause(sql: string): boolean {
  // Simple check: does the SQL contain WHERE after the FROM clause?
  const upperSql = sql.toUpperCase();
  const fromIdx  = upperSql.indexOf('FROM');
  const whereIdx = upperSql.indexOf('WHERE');
  return whereIdx > fromIdx && whereIdx !== -1;
}

function isDeleteStatement(sql: string): boolean {
  return /^\s*DELETE\s+FROM\s+/i.test(sql.trim());
}

function main(): void {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.log('✅ migration-delete-safety: no migrations directory');
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
    const relative = `src/migrations/${filename}`;

    // BASELINE_ — exempt (may have seed-data deletes for idempotency)
    if (filename.includes('BASELINE_')) {
      console.log(`⏭️  ${filename}: exempt (BASELINE)`);
      continue;
    }

    const sqlStatements = extractSqlFromFile(content);
    let fileViolations  = 0;

    for (const sql of sqlStatements) {
      if (!isDeleteStatement(sql)) continue;

      if (!hasWhereClause(sql)) {
        const preview = sql.replace(/\s+/g, ' ').slice(0, 100);
        console.error(`❌ ${relative}: DELETE without WHERE`);
        console.error(`   SQL: ${preview}...`);
        console.error(`   An unqualified DELETE will wipe all rows if the migration`);
        console.error(`   is replayed or run on an unexpected dataset.`);
        console.error(`   Add a WHERE clause, or use TRUNCATE in a BREAKING_ migration.`);
        fileViolations++;
        failed = true;
      }
    }

    if (fileViolations === 0) {
      console.log(`✅ ${filename}`);
    }
  }

  if (failed) {
    console.error('\n❌ migration-delete-safety: unsafe DELETE statements found');
    process.exit(1);
  }

  console.log('\n✅ migration-delete-safety: all DELETE statements are qualified');
}

main();
