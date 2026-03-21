#!/usr/bin/env ts-node
import 'reflect-metadata';
/**
 * scripts/cli/migrate.ts
 *
 * Driver Microservice — Database Migration CLI
 *
 * A Vendure-style migration command that wraps every governance check,
 * simulation, auto-classification, and phase decomposition behind a single,
 * self-documenting interface. Developers never need to know the prefix rules
 * or manually run governance scripts.
 *
 * Usage (after adding to package.json):
 *   npm run migrate -- --help
 *   npm run migrate -- --generate AddDriverRating
 *   npm run migrate -- --run
 *   npm run migrate -- --revert
 *   npm run migrate -- --generate AddDriverRating --output-dir src/migrations/pending
 *   npm run migrate -- --run --config src/config/data-source.staging.ts
 */

import { Command, Option } from 'commander';
import * as path from 'path';
import * as fs from 'fs';
import { spawnSync, SpawnSyncReturns } from 'child_process';
import { ensureBaselineExists } from "../db/baseline";
import { DataSource } from 'typeorm';

// ── Constants ────────────────────────────────────────────────────────────────

const VERSION          = '2.0.0';
const DEFAULT_CONFIG   = 'src/config/data-source.ts';
const DEFAULT_OUT_DIR  = 'src/migrations';
const VALID_PREFIXES   = ['SAFE_', 'DATA_', 'BREAKING_', 'FIX_', 'BASELINE_'] as const;
type Prefix = typeof VALID_PREFIXES[number];

// ── Colour helpers (no external dep) ─────────────────────────────────────────

const c = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  green:  '\x1b[32m',
  yellow: '\x1b[33m',
  red:    '\x1b[31m',
  cyan:   '\x1b[36m',
  blue:   '\x1b[34m',
  magenta:'\x1b[35m',
  white:  '\x1b[37m',
};

const fmt = {
  ok:      (s: string) => `${c.green}✅ ${s}${c.reset}`,
  warn:    (s: string) => `${c.yellow}⚠️  ${s}${c.reset}`,
  err:     (s: string) => `${c.red}❌ ${s}${c.reset}`,
  info:    (s: string) => `${c.cyan}ℹ️  ${s}${c.reset}`,
  step:    (n: number, total: number, s: string) =>
             `${c.dim}[${n}/${total}]${c.reset} ${c.bold}${s}${c.reset}`,
  header:  (s: string) => `\n${c.bold}${c.blue}${s}${c.reset}\n${'─'.repeat(s.length + 2)}`,
  prefix:  (p: string) => {
    const colours: Record<string, string> = {
      SAFE_: c.green, DATA_: c.cyan, BREAKING_: c.red,
      FIX_: c.yellow, BASELINE_: c.magenta,
    };
    return `${colours[p] ?? c.white}${c.bold}${p}${c.reset}`;
  },
};

// ── Spawn helper ──────────────────────────────────────────────────────────────

function exec(
  cmd: string,
  args: string[],
  opts: { silent?: boolean; env?: NodeJS.ProcessEnv } = {},
): SpawnSyncReturns<Buffer> {
  return spawnSync(cmd, args, {
    stdio: opts.silent ? 'pipe' : 'inherit',
    env:   { ...process.env, ...opts.env },
  });
}

function mustExec(cmd: string, args: string[], label?: string): void {
  const result = exec(cmd, args);
  if (result.status !== 0) {
    if (label) process.stderr.write(fmt.err(`${label} failed`) + '\n');
    process.exit(result.status ?? 1);
  }
}

// ── SQL classifier (used by generate to auto-detect prefix) ──────────────────

export type SqlCategory = 'SAFE' | 'DATA' | 'BREAKING' | 'FIX';

interface ClassifiedStatement {
  sql:      string;
  category: SqlCategory;
  reason:   string;
}

const SQL_RULES: Array<{ pattern: RegExp; category: SqlCategory; reason: string }> = [
  // BREAKING — always check first (most restrictive)
  { pattern: /\bDROP\s+TABLE\b/i,        category: 'BREAKING', reason: 'DROP TABLE removes data permanently' },
  { pattern: /\bDROP\s+COLUMN\b/i,       category: 'BREAKING', reason: 'DROP COLUMN removes data permanently' },
  { pattern: /\bDROP\s+TYPE\b/i,         category: 'BREAKING', reason: 'DROP TYPE is destructive' },
  { pattern: /\bALTER\s+TYPE\b/i,        category: 'BREAKING', reason: 'ALTER TYPE can cause table rewrites' },
  { pattern: /SET\s+NOT\s+NULL/i,        category: 'BREAKING', reason: 'SET NOT NULL enforces constraint (needs data prep first)' },
  { pattern: /\bRENAME\s+COLUMN\b/i,     category: 'BREAKING', reason: 'RENAME COLUMN breaks existing queries' },
  { pattern: /\bRENAME\s+TABLE\b/i,      category: 'BREAKING', reason: 'RENAME TABLE breaks existing queries' },
  { pattern: /\bALTER\s+COLUMN\b.*TYPE\b/i, category: 'BREAKING', reason: 'Changing column type can corrupt data' },
  // DATA — mutations
  { pattern: /^\s*UPDATE\s+\w/im,        category: 'DATA', reason: 'Data update / backfill' },
  { pattern: /^\s*INSERT\s+INTO\b/im,    category: 'DATA', reason: 'Data insert / backfill' },
  { pattern: /^\s*DELETE\s+FROM\b/im,    category: 'DATA', reason: 'Data deletion' },
  { pattern: /^\s*COPY\s+\w/im,         category: 'DATA', reason: 'Bulk data copy' },
  // SAFE — expansions
  { pattern: /\bCREATE\s+TABLE\b/i,      category: 'SAFE', reason: 'New table (additive)' },
  { pattern: /\bCREATE\s+INDEX\b/i,      category: 'SAFE', reason: 'New index (additive)' },
  { pattern: /\bCREATE\s+TYPE\b/i,       category: 'SAFE', reason: 'New enum/type (additive)' },
  { pattern: /\bADD\s+COLUMN\b/i,        category: 'SAFE', reason: 'New column (must be nullable)' },
  { pattern: /\bADD\s+CONSTRAINT\b/i,    category: 'SAFE', reason: 'New constraint (check data first)' },
  { pattern: /\bCREATE\s+SEQUENCE\b/i,   category: 'SAFE', reason: 'New sequence (additive)' },
];

export function classifySqlStatement(sql: string): ClassifiedStatement {
  for (const rule of SQL_RULES) {
    if (rule.pattern.test(sql)) {
      return { sql, category: rule.category, reason: rule.reason };
    }
  }
  return { sql, category: 'SAFE', reason: 'Unrecognised statement — defaulting to SAFE' };
}

export function classifyMigrationFile(filePath: string): {
  categories: Set<SqlCategory>;
  statements: ClassifiedStatement[];
  dominantPrefix: Prefix;
  needsPhaseDecomposition: boolean;
  phases: SqlCategory[];
} {
  const content = fs.readFileSync(filePath, 'utf8');

  // Extract SQL strings from queryRunner.query(` ... `) calls
  const sqlBlocks: string[] = [];
  const re = /queryRunner\.query\(\s*`([\s\S]*?)`\s*[,)]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(content)) !== null) {
    // Split on semicolons to get individual statements
    m[1].split(';').forEach((s) => {
      const trimmed = s.trim();
      if (trimmed.length > 5) sqlBlocks.push(trimmed);
    });
  }

  const statements = sqlBlocks.map(classifySqlStatement);
  const categories = new Set(statements.map((s) => s.category));

  // Priority: BREAKING > DATA > SAFE > FIX
  let dominantPrefix: Prefix = 'SAFE_';
  if (categories.has('BREAKING')) dominantPrefix = 'BREAKING_';
  else if (categories.has('DATA'))    dominantPrefix = 'DATA_';
  else if (categories.has('SAFE'))    dominantPrefix = 'SAFE_';

  // If TypeORM generated a file mixing categories that should be separate phases,
  // the developer needs split files (e.g. ADD COLUMN nullable + SET NOT NULL)
  const needsPhaseDecomposition =
    categories.has('BREAKING') && (categories.has('SAFE') || categories.has('DATA'));

  // Build ordered phase list
  const phases: SqlCategory[] = [];
  if (categories.has('SAFE'))     phases.push('SAFE');
  if (categories.has('DATA'))     phases.push('DATA');
  if (categories.has('BREAKING')) phases.push('BREAKING');

  return { categories, statements, dominantPrefix, needsPhaseDecomposition, phases };
}

// ── NOT NULL auto-rewriter ────────────────────────────────────────────────────

/**
 * When TypeORM generates ADD COLUMN ... NOT NULL (which locks the table and
 * fails on existing rows), rewrite it into the safe three-step pattern:
 *   1. ADD COLUMN nullable   → stays in SAFE migration
 *   2. UPDATE ... SET        → generates companion DATA migration
 *   3. SET NOT NULL          → generates companion BREAKING migration
 *
 * Returns the rewritten content and a list of companion migrations to create.
 */
export function rewriteNotNullViolations(content: string, tableName: string): {
  rewritten: string;
  companions: Array<{ phase: 'DATA' | 'BREAKING'; sql: string; reason: string }>;
} {
  const companions: Array<{ phase: 'DATA' | 'BREAKING'; sql: string; reason: string }> = [];
  let rewritten = content;

  // Match: ADD "column" someType NOT NULL (TypeORM uses quoted identifiers)
  const NOT_NULL_RE = /ADD\s+"(\w+)"\s+((?:[^N]|N(?!OT))*?)NOT\s+NULL/gi;

  rewritten = rewritten.replace(NOT_NULL_RE, (_match, column, typeSpec) => {
    const cleanType = typeSpec.trim().replace(/,\s*$/, '');

    companions.push({
      phase:  'DATA',
      sql:    `-- Backfill: set a safe default for every existing row before enforcing NOT NULL\nUPDATE ${tableName} SET "${column}" = <DEFAULT_VALUE> WHERE "${column}" IS NULL;`,
      reason: `Column "${column}" requires backfill before NOT NULL can be enforced`,
    });

    companions.push({
      phase:  'BREAKING',
      sql:    `ALTER TABLE "${tableName}" ALTER COLUMN "${column}" SET NOT NULL;`,
      reason: `Enforce NOT NULL on "${column}" after data is backfilled`,
    });

    // Return the safe version: nullable column only
    return `ADD "${column}" ${cleanType}`;
  });

  return { rewritten, companions };
}

// ── Header builder ────────────────────────────────────────────────────────────

interface HeaderOptions {
  prefix:       Prefix;
  description?: string;
  phase?:       string;
  phaseTotal?:  number;
  companions?:  string[];
  isAutoFixed?: boolean;
}

function buildHeader(opts: HeaderOptions): string {
  const type   = opts.prefix.replace('_', '');
  const riskMap: Record<string, string>     = { SAFE: 'LOW', DATA: 'MEDIUM', BREAKING: 'HIGH', FIX: 'MEDIUM', BASELINE: 'HIGH' };
  const rollMap: Record<string, string>     = { SAFE: 'SAFE', DATA: 'SAFE', BREAKING: 'DATA_LOSS', FIX: 'SAFE', BASELINE: 'IRREVERSIBLE' };

  const phaseNote = opts.phase && opts.phaseTotal
    ? `Phase ${opts.phase} of ${opts.phaseTotal} — ${opts.description ?? ''}`
    : (opts.description ?? '<REQUIRED — describe what this migration achieves>');

  const companionNote = opts.companions?.length
    ? ` *\n * COMPANION MIGRATIONS (auto-generated — apply in this order):\n${opts.companions.map((c) => ` *   ${c}`).join('\n')}\n`
    : '';

  const autoFixNote = opts.isAutoFixed
    ? ` *\n * AUTO-SAFETY: This file was rewritten by the migration CLI.\n * Original NOT NULL violation(s) were split into companion DATA_ and BREAKING_ files.\n`
    : '';

  const breakingApproval = type === 'BREAKING'
    ? ` *\n * @approved-breaking: <REQUIRED — reviewer name + reason this is safe to deploy>\n`
    : '';

  const checklists: Record<string, string> = {
    SAFE:     ` *   [ ] Reviewed generated SQL (not just the TypeScript)\n *   [ ] Uses IF NOT EXISTS / IF EXISTS for idempotency\n *   [ ] New indexes use CONCURRENTLY + transaction = false\n *   [ ] Tested migration:revert locally\n *   [ ] Passes: npm run db:validate`,
    DATA:     ` *   [ ] Data integrity verified on staging\n *   [ ] Batched for >10k rows (add @large-batch + loop)\n *   [ ] No schema changes mixed in\n *   [ ] Tested migration:revert locally\n *   [ ] Passes: npm run db:validate`,
    BREAKING: ` *   [ ] @approved-breaking filled in with reviewer name and reason\n *   [ ] All app code no longer references dropped/changed column\n *   [ ] Backward-compat layer deployed before this migration\n *   [ ] Coordinated deploy window with team\n *   [ ] Tested migration:revert locally\n *   [ ] Passes: npm run db:validate`,
    FIX:      ` *   [ ] Root cause documented in DESCRIPTION\n *   [ ] Fix does not introduce new inconsistencies\n *   [ ] Tested migration:revert locally\n *   [ ] Passes: npm run db:validate`,
    BASELINE: ` *   [ ] Generated file — do not edit manually\n *   [ ] Applied on fresh DB and db:verify passed`,
  };

  const baselineBypass = type === 'BASELINE' 
    ? `\n// @allow-mixed-ops: Automated baseline generation\n// MIGRATION_GUARD:ALLOW_DESTRUCTIVE\n` 
    : '';

  return `/**
 * INTENT:    ${phaseNote}
 * TYPE:      ${type}
 * RISK:      ${riskMap[type] ?? 'MEDIUM'}
 * ROLLBACK:  ${rollMap[type] ?? 'SAFE'}
 *${companionNote}${autoFixNote}${breakingApproval} *
 * CHECKLIST (mark [x] before merging):
${checklists[type] ?? checklists.SAFE}
 */${baselineBypass}
`;
}

// ── File header injector ──────────────────────────────────────────────────────

function injectHeader(filePath: string, header: string): void {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, 'utf8');
  const lines   = content.split('\n');

  // Insert after the last import line
  let insertAt = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith('import ')) insertAt = i + 1;
    else if (lines[i].trim() && !lines[i].startsWith('import ')) break;
  }

  const newContent = [...lines.slice(0, insertAt), header, ...lines.slice(insertAt)].join('\n');
  fs.writeFileSync(filePath, newContent);
}

// ── Rename file with new prefix ───────────────────────────────────────────────

function renameWithPrefix(filePath: string, newPrefix: Prefix): string {
  const dir      = path.dirname(filePath);
  const base     = path.basename(filePath);
  const tsMatch  = base.match(/^(\d{13,})-(.+)\.ts$/);
  if (!tsMatch) return filePath;

  const [, timestamp, rest] = tsMatch;
  // Strip any existing prefix from the name part
  const nameWithoutPrefix = VALID_PREFIXES.reduce(
    (acc, p) => acc.startsWith(p) ? acc.slice(p.length) : acc,
    rest,
  );
  const newBase = `${timestamp}-${newPrefix}${nameWithoutPrefix}.ts`;
  const newPath = path.join(dir, newBase);
  fs.renameSync(filePath, newPath);
  return newPath;
}

// ── Companion file writer ─────────────────────────────────────────────────────

function writeCompanionMigration(
  basePath: string,
  phase: 'DATA' | 'BREAKING',
  sql: string,
  header: string,
  index: number,
): string {
  const dir        = path.dirname(basePath);
  const base       = path.basename(basePath, '.ts');
  const tsMatch    = base.match(/^(\d{13,})-(.+)$/);
  if (!tsMatch) throw new Error(`Cannot parse migration filename: ${base}`);

  const [, timestamp, namePart] = tsMatch;
  const newTimestamp = String(parseInt(timestamp, 10) + index);
  const prefix: Prefix = phase === 'DATA' ? 'DATA_' : 'BREAKING_';
  const nameWithoutPrefix = VALID_PREFIXES.reduce(
    (acc, p) => acc.startsWith(p) ? acc.slice(p.length) : acc,
    namePart,
  );
  const className = `${prefix.replace('_', '')}${nameWithoutPrefix}${newTimestamp}`;
  const filename  = `${newTimestamp}-${prefix}${nameWithoutPrefix}.ts`;
  const filePath  = path.join(dir, filename);

  const content = `import { MigrationInterface, QueryRunner } from 'typeorm';

${header}
export class ${className} implements MigrationInterface {
  name = '${className}';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(\`
      ${sql}
    \`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // TODO: reverse the above — describe rollback in the header's ROLLBACK PLAN
    throw new Error('Manual rollback required — see ROLLBACK PLAN in header');
  }
}
`;

  fs.writeFileSync(filePath, content);
  return filePath;
}

// ── Advisory lock helpers ─────────────────────────────────────────────────────

// Application-specific lock key — unique integer that identifies this project.
// Must be consistent across all environments. Never reuse the same key for a
// different application on the same Postgres instance.
const ADVISORY_LOCK_KEY = 847291;

async function acquireAdvisoryLock(ds: DataSource): Promise<void> {
  // pg_advisory_lock blocks until the lock is available (no timeout).
  // It is automatically released when the session ends — crash-safe.
  await ds.query(`SELECT pg_advisory_lock($1)`, [ADVISORY_LOCK_KEY]);
}

async function releaseAdvisoryLock(ds: DataSource): Promise<void> {
  await ds.query(`SELECT pg_advisory_unlock($1)`, [ADVISORY_LOCK_KEY]);
}

// ── Orphan-only drift check (used only inside --run pipeline) ─────────────────────────────────────────────────────────

/**
 * Returns true if the _migrations tracking table does not exist yet.
 * Uses information_schema so it never throws on a fresh database.
 */
async function isMigrationsTableMissing(
  ds: DataSource,
  tableName: string,
): Promise<boolean> {
  const rows = await ds.query(`
    SELECT EXISTS (
      SELECT 1
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name   = $1
    ) AS "exists"
  `, [tableName]) as Array<{ exists: boolean }>;
  return !rows[0]?.exists;
}

function normalizeForComparison(name: string): string {
  return name.replace(/_/g, '');
}

/**
 * Drift check scoped to the --run pipeline.
 *
 * Purpose: detect migrations that were applied to the DB but whose files
 * were subsequently deleted — these are genuine drift and should block apply.
 *
 * NOT a failure condition:
 * - Pending migrations (files present, not yet applied) — that's what --run is for.
 *
 * @returns true if safe to proceed, false if orphaned migrations were found.
 */
async function checkOrphanedMigrations(configPath: string): Promise<boolean> {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod        = require(path.resolve(process.cwd(), configPath));
  const ds: DataSource = mod.default ?? mod;
  const tableName  = (ds.options as any).migrationsTableName ?? '_migrations';

  await ds.initialize();

  try {
    // Fresh DB — _migrations doesn't exist yet, nothing can be orphaned
    if (await isMigrationsTableMissing(ds, tableName)) {
      console.log(fmt.ok('Fresh database — no orphaned migrations possible'));
      return true;
    }

    const appliedRows = await ds.query(
      `SELECT name FROM ${tableName} ORDER BY id`,
    ) as Array<{ name: string }>;

    const codeNames = new Set(
      (ds.migrations as any[]).map((m) =>
        normalizeForComparison(m.name ?? m.constructor?.name ?? ''),
      ),
    );

    const orphaned = appliedRows
      .map((r) => r.name)
      .filter((name) => !codeNames.has(normalizeForComparison(name)));

    const pendingCount = (ds.migrations as any[]).filter((m) => {
      const name = normalizeForComparison(m.name ?? m.constructor?.name ?? '');
      const appliedSet = new Set(appliedRows.map((r) => normalizeForComparison(r.name)));
      return !appliedSet.has(name);
    }).length;

    if (orphaned.length > 0) {
      console.error(fmt.err(`${orphaned.length} orphaned migration(s) found in database but missing from code:`));
      orphaned.forEach((n) => console.error(`    • ${n}`));
      console.error('');
      console.error('  These migrations were applied to the database but their files were deleted.');
      console.error('  Restore the files or check git history before proceeding.');
      return false;
    }

    if (pendingCount > 0) {
      console.log(fmt.ok(`No orphaned migrations — ${pendingCount} pending (will be applied next)`));
    } else {
      console.log(fmt.ok('No drift detected — schema and code are in sync'));
    }

    return true;

  } finally {
    await ds.destroy();
  }
}

// ── Governance runner ─────────────────────────────────────────────────────────

interface GovernanceCheck {
  label:  string;
  script: string;
  env?:   Record<string, string>;
}

const GOVERNANCE_CHECKS: GovernanceCheck[] = [
  { label: 'Naming policy',          script: 'scripts/governance/naming.ts' },
  { label: 'Intent header',          script: 'scripts/governance/intent.ts' },
  { label: 'Size limit',             script: 'scripts/governance/size-check.ts' },
  { label: 'Mixed operations',       script: 'scripts/governance/mixed-check.ts' },
  { label: 'Delete safety',          script: 'scripts/governance/delete-safety.ts' },
  { label: 'SQL guard',              script: 'scripts/governance/guard.ts' },
  { label: 'Transaction safety',     script: 'scripts/governance/transaction.ts' },
  { label: 'Rollback coverage',      script: 'scripts/governance/rollback.ts' },
  { label: 'Timestamp order',        script: 'scripts/governance/order.ts' },
  { label: 'Lint',                   script: 'scripts/governance/lint.ts' },
];

/** Also support the legacy flat-scripts layout if the new structure isn't present. */
const LEGACY_GOVERNANCE_CHECKS: GovernanceCheck[] = [
  { label: 'Naming policy',          script: 'scripts/migration-naming-policy.ts' },
  { label: 'Intent header',          script: 'scripts/migration-intent.ts' },
  { label: 'Size limit',             script: 'scripts/migration-size-check.ts' },
  { label: 'Mixed operations',       script: 'scripts/migration-mixed-ops-check.ts' },
  { label: 'Delete safety',          script: 'scripts/migration-delete-safety.ts' },
  { label: 'SQL guard',              script: 'scripts/migration-guard.ts' },
  { label: 'Transaction safety',     script: 'scripts/migration-transaction-check.ts' },
  { label: 'Rollback coverage',      script: 'scripts/migration-rollback-check.ts' },
  { label: 'Timestamp order',        script: 'scripts/migration-order.ts' },
  { label: 'Lint',                   script: 'scripts/migration-lint.ts' },
];

function resolveGovernanceChecks(): GovernanceCheck[] {
  return fs.existsSync('scripts/governance/guard.ts')
    ? GOVERNANCE_CHECKS
    : LEGACY_GOVERNANCE_CHECKS;
}

function runGovernanceChecks(onlyLatest = true): boolean {
  const checks = resolveGovernanceChecks();
  const total  = checks.length;

  console.log(fmt.header('Governance Checks'));

  let passed = true;
  for (let i = 0; i < checks.length; i++) {
    const check = checks[i];
    process.stdout.write(`  ${fmt.step(i + 1, total, check.label.padEnd(22))} `);

    const env = onlyLatest ? {} : { MIGRATION_GUARD_CHECK_ALL: 'true', MIGRATION_NAMING_CHECK_ALL: 'true' };
    const result = exec('npx', ['ts-node', check.script], { silent: true, env: { ...check.env, ...env } });

    if (result.status === 0) {
      process.stdout.write(fmt.ok('') + '\n');
    } else {
      process.stdout.write(fmt.err('') + '\n');
      // Print the actual error indented
      const stderr = result.stderr?.toString().trim();
      const stdout = result.stdout?.toString().trim();
      const msg    = (stderr || stdout || 'Unknown error').split('\n').map((l) => `       ${l}`).join('\n');
      console.error(msg);
      passed = false;
    }
  }

  return passed;
}

// ── Simulation ────────────────────────────────────────────────────────────────

async function runSimulation(configPath: string): Promise<void> {
  // We delegate to the simulation script so it can be used standalone too
  const simulateScript = fs.existsSync('scripts/db/simulate.ts')
    ? 'scripts/db/simulate.ts'
    : null;

  if (!simulateScript) {
    console.log(fmt.warn('Simulation script not found — skipping dry-run'));
    return;
  }

  const result = exec('npx', ['ts-node', simulateScript, '--config', configPath], { silent: true });

  if (result.status !== 0) {
    console.error(fmt.err('Migration simulation failed — migrations NOT applied'));
    const msg = (result.stderr?.toString() || result.stdout?.toString() || '').trim();
    if (msg) {
      console.error('\n  Simulation output:');
      msg.split('\n').forEach((l) => console.error(`    ${l}`));
    }
    process.exit(1);
  }

  console.log(fmt.ok('Simulation passed — SQL verified in dry-run transaction'));
}

// ── GENERATE command ──────────────────────────────────────────────────────────

async function runGenerate(opts: {
  name:      string;
  outputDir: string;
  config:    string;
}): Promise<void> {
  const { name, outputDir, config } = opts;

  // Strip any prefix the developer may have manually typed
  const strippedName = VALID_PREFIXES.reduce(
    (acc, p) => acc.startsWith(p) ? acc.slice(p.length) : acc,
    name,
  );

  // Block baseline names entirely
  if (strippedName.toLowerCase().includes("baseline")) {
    console.log(fmt.warn('Baselines are automatic.'));
    console.log(fmt.warn('Run db:migrate instead.'));
    return;
  }

  console.log(fmt.header('Generate Migration'));
  console.log(`  Name:       ${c.bold}${strippedName}${c.reset}`);
  console.log(`  Config:     ${config}`);
  console.log(`  Output dir: ${outputDir}`);
  console.log('');

  // Step 1 — verify project root
  process.stdout.write(`  ${fmt.step(1, 5, 'Project root check')} `);
  const rootCheck = exec('npx', ['ts-node', 'scripts/project-root.ts'], { silent: true });
  if (rootCheck.status !== 0) {
    process.stdout.write(fmt.err('') + '\n');
    console.error(fmt.err('Not inside driver-micro-services project root'));
    process.exit(1);
  }
  process.stdout.write(fmt.ok('') + '\n');

  // Step 2 — run TypeORM migration:generate (temporary name, we'll rename)
  // Use a temporary SAFE_ prefix so TypeORM creates the file; we classify and rename after
  const tempName     = `${outputDir}/SAFE_${strippedName}`;
  process.stdout.write(`  ${fmt.step(2, 5, 'TypeORM schema diff')} `);

  const genResult = exec(
    'npx',
    ['typeorm-ts-node-commonjs', 'migration:generate', tempName, '-d', config],
    { silent: true },
  );

  if (genResult.status !== 0) {
    const out = (genResult.stdout?.toString() || genResult.stderr?.toString() || '').trim();
    if (out.includes('No changes in database schema')) {
      process.stdout.write(fmt.ok('') + '\n');
      console.log('\n' + fmt.info('No entity changes detected — no migration needed'));
      console.log(`  ${c.dim}All entities are in sync with the database schema.${c.reset}`);
      return;
    }
    process.stdout.write(fmt.err('') + '\n');
    console.error(out.split('\n').map((l) => `  ${l}`).join('\n'));
    process.exit(1);
  }
  process.stdout.write(fmt.ok('') + '\n');

  // Find the generated file
  const files = fs.readdirSync(outputDir)
    .filter((f) => f.includes(`SAFE_${strippedName}`) && f.endsWith('.ts'))
    .sort()
    .reverse();

  if (!files.length) {
    console.error(fmt.err(`Generated file not found in ${outputDir}`));
    process.exit(1);
  }

  let primaryFile = path.join(outputDir, files[0]);

  // Step 3 — classify SQL and detect phases
  process.stdout.write(`  ${fmt.step(3, 5, 'Auto-classify SQL')} `);
  const classification = classifyMigrationFile(primaryFile);
  
  process.stdout.write(fmt.ok('') + '\n');

  // Print what was found
  console.log('');
  console.log(`  ${c.bold}SQL analysis:${c.reset}`);
  classification.statements.forEach((stmt) => {
    const p = stmt.category === 'BREAKING' ? c.red
             : stmt.category === 'DATA'    ? c.cyan
             : c.green;
    console.log(`    ${p}${stmt.category.padEnd(8)}${c.reset}  ${c.dim}${stmt.reason}${c.reset}`);
  });

  // Step 4 — NOT NULL rewrite and phase decomposition
  process.stdout.write(`\n  ${fmt.step(4, 5, 'Auto-safety rewrites')} `);

  let companionFiles: string[] = [];
  let safetyFixed = false;
  let companions: Array<{ phase: 'DATA' | 'BREAKING'; sql: string; reason: string }> = [];

  // Detect table name from context (best effort — get from first CREATE/ALTER)
  const rawContent  = fs.readFileSync(primaryFile, 'utf8');
  const tableMatch  = rawContent.match(/["']?(\w+)["']?/);
  const tableName   = tableMatch?.[1] ?? 'TABLE_NAME';
  const { rewritten, companions: baselineCompanions } = rewriteNotNullViolations(rawContent, tableName);
  companions = baselineCompanions;
  if (companions.length > 0) {
    fs.writeFileSync(primaryFile, rewritten);
    safetyFixed = true;

    // Write companion files offset by 1ms per companion
    companions.forEach((comp, idx) => {
      const companionHeader = buildHeader({
        prefix:      comp.phase === 'DATA' ? 'DATA_' : 'BREAKING_',
        description: comp.reason,
        phase:       String(idx + 2),
        phaseTotal:  companions.length + 1,
      });
      const companionPath = writeCompanionMigration(
        primaryFile, comp.phase, comp.sql, companionHeader, idx + 1,
      );
      companionFiles.push(companionPath);
    });
  }

  process.stdout.write(safetyFixed ? fmt.ok('NOT NULL violations auto-rewritten') + '\n' : fmt.ok('No rewrites needed') + '\n');

  // Phase decomposition: if TypeORM merged phases that should be separate
  if (classification.needsPhaseDecomposition &&
      companions.length === 0) {
    console.log('');
    console.log(fmt.warn('Mixed operation types detected — this migration mixes SAFE + BREAKING SQL'));
    console.log(`  ${c.dim}The Expand → Migrate → Contract pattern requires separate files.${c.reset}`);
    console.log(`  ${c.dim}Review the generated file and split it manually, or re-run with specific entity changes.${c.reset}`);
  }

  // Step 5 — rename with auto-detected prefix and inject header
  process.stdout.write(`  ${fmt.step(5, 5, 'Inject header & rename')} `);

  primaryFile = renameWithPrefix(primaryFile, classification.dominantPrefix);
  const companionNames = companionFiles.map((f) => path.basename(f));
  const header = buildHeader({
    prefix:      classification.dominantPrefix,
    description: `<REQUIRED — describe what this migration achieves>`,
    companions:  companionNames.length > 0 ? companionNames : undefined,
    isAutoFixed: safetyFixed,
    phase:       classification.needsPhaseDecomposition ? '1' : undefined,
    phaseTotal:  classification.needsPhaseDecomposition ? classification.phases.length : undefined,
  });
  injectHeader(primaryFile, header);
  process.stdout.write(fmt.ok('') + '\n');

  // ── Summary ────────────────────────────────────────────────────────────────

  console.log(fmt.header('Generated Files'));

  const allFiles = [primaryFile, ...companionFiles];
  allFiles.forEach((f, i) => {
    const base     = path.basename(f);
    const prefixMatch = VALID_PREFIXES.find((p) => base.includes(p));
    const prefix   = prefixMatch ?? 'SAFE_';
    const phase    = i === 0 ? 'Phase 1 (primary)' : `Phase ${i + 1} (companion)`;
    console.log(`  ${fmt.prefix(prefix)} ${c.bold}${base}${c.reset}`);
    console.log(`  ${c.dim}  ${phase} — ${outputDir}/${base}${c.reset}`);
    console.log('');
  });

  // Next steps
  console.log(fmt.header('Next Steps'));
  console.log(`  1. ${c.bold}Review generated SQL${c.reset}`);
  console.log(`     Open the file(s) above — TypeORM's diff is a starting point, not final truth`);
  if (safetyFixed) {
    console.log(`  2. ${c.bold}${c.yellow}Fill in backfill values${c.reset}`);
    console.log(`     The DATA_ companion has a <DEFAULT_VALUE> placeholder — replace it`);
    console.log(`  3. ${c.bold}Fill in the INTENT field${c.reset} in each file's header`);
    console.log(`  4. ${c.bold}Run:${c.reset} npm run db:migrate`);
  } else {
    console.log(`  2. ${c.bold}Fill in the INTENT field${c.reset} in the header`);
    console.log(`  3. ${c.bold}Run:${c.reset} npm run db:migrate`);
  }

  if (classification.dominantPrefix === 'BREAKING_') {
    console.log('');
    console.log(fmt.warn('BREAKING migration — requires @approved-breaking before CI will pass'));
    console.log(`     Add: @approved-breaking: <your name — reason this is safe>`);
  }
}

// ── RUN command ───────────────────────────────────────────────────────────────

async function runMigrate(opts: { config: string; skipSimulate?: boolean }): Promise<void> {
  console.log(fmt.header('Run Migrations'));

  const total = 6;  // bumped from 5 — lock step added

  // Step 1 — Baseline check
  console.log(`\n  ${fmt.step(1, total, 'Baseline check')}`);
  ensureBaselineExists();
  console.log(fmt.ok('Baseline ready'));

  // Step 2 — Governance checks
  console.log(`\n  ${fmt.step(2, total, 'Governance checks')}`);
  const governancePassed = runGovernanceChecks(true);
  if (!governancePassed) {
    console.error('\n' + fmt.err('Governance checks failed — migrations NOT applied'));
    console.error(`  Fix the issues above, then run: ${c.bold}npm run db:migrate${c.reset}`);
    process.exit(1);
  }

  // Step 3 — Drift check (orphaned-only — pending migrations are expected here)
  console.log(`\n  ${fmt.step(3, total, 'Drift check')}`);
  const driftSafe = await checkOrphanedMigrations(opts.config);
  if (!driftSafe) {
    console.error(fmt.err('Drift check failed — migrations NOT applied'));
    console.error('  Restore the missing migration file(s) and re-run.');
    process.exit(1);
  }

  // Step 4 — Acquire advisory lock
  // Acquired here — after cheap static checks but before simulation and apply.
  // Minimises lock hold time while protecting the critical section.
  console.log(`\n  ${fmt.step(4, total, 'Schema lock')}`);

  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod          = require(path.resolve(process.cwd(), opts.config));
  const lockDs: DataSource = mod.default ?? mod;
  await lockDs.initialize();

  try {
    await acquireAdvisoryLock(lockDs);
    console.log(fmt.ok(`Advisory lock acquired (key: ${ADVISORY_LOCK_KEY})`));

    // Step 5 — Simulation (dry run)
    console.log(`\n  ${fmt.step(5, total, 'Simulation (dry run)')}`);
    if (!opts.skipSimulate) {
      await runSimulation(opts.config);
    } else {
      console.log(fmt.warn('Simulation skipped (--skip-simulate flag set)'));
    }

    // Step 6 — Apply migrations
    console.log(`\n  ${fmt.step(6, total, 'Apply migrations')}`);
    mustExec(
      'npx',
      ['typeorm-ts-node-commonjs', 'migration:run', '-d', opts.config],
      'Migration run',
    );

    // Post-apply schema verification
    console.log('');
    const verifyScript = fs.existsSync('scripts/db/verify.ts')
      ? 'scripts/db/verify.ts'
      : 'scripts/db-verify.ts';
    const verifyResult = exec('npx', ['ts-node', verifyScript], { silent: true });
    if (verifyResult.status !== 0) {
      console.log(fmt.warn('Schema verification had warnings — check: npm run db:verify'));
    } else {
      console.log(fmt.ok('Schema verification passed'));
    }

  } finally {
    // Always release — even if simulation or apply threw.
    // pg_advisory_unlock is a no-op if the lock was never acquired.
    try {
      await releaseAdvisoryLock(lockDs);
      console.log(fmt.ok('Advisory lock released'));
    } catch {
      // Session ending will auto-release the lock — not critical to log.
    }
    await lockDs.destroy();
  }

  console.log(fmt.header('✅ Migrations Applied Successfully'));
}

// ── REVERT command ────────────────────────────────────────────────────────────

async function runRevert(opts: { config: string; count: number }): Promise<void> {
  console.log(fmt.header('Revert Migration'));

  // Show what's about to be reverted
  const showResult = exec(
    'npx',
    ['typeorm-ts-node-commonjs', 'migration:show', '-d', opts.config],
    { silent: true },
  );
  const showOutput = showResult.stdout?.toString() ?? '';
  const lastRan    = showOutput.split('\n').filter((l) => l.includes('[X]')).pop()?.trim();

  if (lastRan) {
    console.log(`  Reverting: ${c.bold}${lastRan}${c.reset}`);
  }

  // Safety warning
  if (opts.count > 1) {
    console.log(fmt.warn(`Reverting ${opts.count} migration(s) — this may cause data loss`));
  }

  for (let i = 0; i < opts.count; i++) {
    if (opts.count > 1) console.log(`  Reverting ${i + 1} of ${opts.count}...`);
    mustExec(
      'npx',
      ['typeorm-ts-node-commonjs', 'migration:revert', '-d', opts.config],
      `Revert ${i + 1}`,
    );
  }

  console.log(fmt.ok(`Successfully reverted ${opts.count} migration(s)`));
  console.log(`  ${c.dim}Run ${c.bold}npm run db:migrate${c.reset}${c.dim} to re-apply${c.reset}`);
}

// ── STATUS command ────────────────────────────────────────────────────────────

async function runStatus(config: string): Promise<void> {
  console.log(fmt.header('Migration Status'));
  exec('npx', ['typeorm-ts-node-commonjs', 'migration:show', '-d', config]);
}

// ── CLI definition (Commander.js) ─────────────────────────────────────────────

async function main(): Promise<void> {
  const program = new Command();

  program
    .name('migrate')
    .description(
      `${c.bold}Generate, run or revert a database migration${c.reset}\n\n` +
      `  Prefixes are auto-detected from entity changes. You never need\n` +
      `  to choose between SAFE/DATA/BREAKING — the CLI does it for you.\n\n` +
      `  Examples:\n` +
      `    ${c.dim}npm run migrate -- --generate AddDriverRating${c.reset}\n` +
      `    ${c.dim}npm run migrate -- --run${c.reset}\n` +
      `    ${c.dim}npm run migrate -- --revert${c.reset}\n` +
      `    ${c.dim}npm run migrate -- --status${c.reset}`,
    )
    .version(VERSION, '-v, --version', 'Output the CLI version')
    .addHelpText('afterAll', `\n  Prefix reference:\n    ${fmt.prefix('SAFE_')} additive schema (columns, tables, indexes)\n    ${fmt.prefix('DATA_')} data movement and backfills\n    ${fmt.prefix('BREAKING_')} destructive changes (DROP, SET NOT NULL)\n    ${fmt.prefix('FIX_')} targeted repair migrations\n    ${fmt.prefix('BASELINE_')} full schema snapshot\n`);

  // ── --generate ─────────────────────────────────────────────────────────────

  program
    .option(
      '-g, --generate [name]',
      'Generate a new migration by diffing entity definitions against the live schema.\n' +
      '                             Prefix (SAFE_/DATA_/BREAKING_) is auto-detected from the SQL diff.\n' +
      '                             NOT NULL violations are automatically rewritten into safe phases.',
    );

  // ── --run ──────────────────────────────────────────────────────────────────

  program
    .option(
      '-r, --run',
      'Run all pending migrations.\n' +
      '                             Runs governance checks → dry-run simulation → apply → verify.',
    );

  // ── --revert ───────────────────────────────────────────────────────────────

  program
    .option(
      '--revert',
      'Revert the last applied migration.\n' +
      '                             Use --count to revert multiple migrations.',
    );

  // ── --status ───────────────────────────────────────────────────────────────

  program
    .option(
      '-s, --status',
      'Show which migrations have been applied and which are pending.',
    );

  // ── shared options ─────────────────────────────────────────────────────────

  program
    .option(
      '-o, --output-dir <path>',
      'Output directory for generated migrations',
      DEFAULT_OUT_DIR,
    )
    .option(
      '--config <path>',
      'Path to the TypeORM DataSource config file',
      DEFAULT_CONFIG,
    )
    .option(
      '--count <n>',
      'Number of migrations to revert (use with --revert)',
      '1',
    )
    .option(
      '--skip-simulate',
      'Skip the dry-run simulation step (use only in emergencies)',
    )
    .option(
      '--check-all',
      'Run governance checks against all migration files (default: latest only)',
    );

  program.parse(process.argv);
  const opts = program.opts();

  // Validate config file exists
  if (!fs.existsSync(opts.config)) {
    console.error(fmt.err(`Config file not found: ${opts.config}`));
    console.error(`  Provide a valid path with: ${c.bold}--config <path>${c.reset}`);
    process.exit(1);
  }

  // Route to command
  if (opts.generate !== undefined) {
    const name = typeof opts.generate === 'string' ? opts.generate : '';
    if (!name) {
      console.error(fmt.err('--generate requires a migration name'));
      console.error(`  Usage: ${c.bold}npm run migrate -- --generate AddDriverRating${c.reset}`);
      process.exit(1);
    }
    await runGenerate({ name, outputDir: opts.outputDir, config: opts.config });

  } else if (opts.run) {
    await runMigrate({ config: opts.config, skipSimulate: !!opts.skipSimulate });

  } else if (opts.revert) {
    await runRevert({ config: opts.config, count: parseInt(opts.count, 10) });

  } else if (opts.status) {
    await runStatus(opts.config);

  } else {
    program.help();
  }
}

main().catch((err) => {
  console.error(fmt.err('Unexpected error:'), err instanceof Error ? err.message : String(err));
  process.exit(1);
});