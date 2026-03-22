#!/usr/bin/env ts-node
/**
 * Automated Migration Generator CLI
 * 
 * Orchestrates the entire migration generation process:
 * 1. Detects schema changes using TypeORM
 * 2. Classifies operations as SAFE/DATA/BREAKING
 * 3. Splits complex operations into lifecycle phases
 * 4. Generates properly formatted migration files
 * 5. Integrates with existing governance pipeline
 */

import 'reflect-metadata';
import * as path from 'path';
import * as fs from 'fs';
import { Command, Option } from 'commander';

// Import our new migration engine modules
import { detectSchemaDiff, detectSchemaDiffWithTypes } from '../migration-engine/detect-schema-diff';
import { classifyMigrationFile, classifySqlStatement } from '../migration-engine/classify-operations';
import { LifecycleSplitter } from '../migration-engine/lifecycle-split';
import { generateLifecycleMigrations } from '../migration-engine/generate-migration';

// Import existing governance functions from migrate.ts
import { runGovernanceChecks } from './migrate';

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

// ── Main Generation Logic ─────────────────────────────────────────────────────

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
  process.stdout.write(`  ${fmt.step(1, 6, 'Project root check')} `);
  const rootCheck = require('child_process').spawnSync(
    'npx', ['ts-node', 'scripts/project-root.ts'], { silent: true }
  );
  if (rootCheck.status !== 0) {
    process.stdout.write(fmt.err('') + '\n');
    console.error(fmt.err('Not inside driver-micro-services project root'));
    process.exit(1);
  }
  process.stdout.write(fmt.ok('') + '\n');

  // Step 2 — detect schema changes
  process.stdout.write(`  ${fmt.step(2, 6, 'Schema diff detection')} `);
  
  try {
    const diff = await detectSchemaDiff(config);
    
    if (diff.up.length === 0) {
      process.stdout.write(fmt.ok('') + '\n');
      console.log('\n' + fmt.info('No entity changes detected — no migration needed'));
      console.log(`  ${c.dim}All entities are in sync with the database schema.${c.reset}`);
      return;
    }
    
    process.stdout.write(fmt.ok('') + '\n');
    console.log(`  Detected ${diff.up.length} schema change(s)`);

  } catch (error) {
    process.stdout.write(fmt.err('') + '\n');
    console.error(fmt.err('Schema detection failed:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  // Step 3 — generate TypeORM migration (temporary file)
  process.stdout.write(`  ${fmt.step(3, 6, 'TypeORM migration generation')} `);

  const tempName = `${outputDir}/TEMP_${strippedName}`;
  const genResult = require('child_process').spawnSync(
    'npx',
    ['typeorm-ts-node-commonjs', 'migration:generate', tempName, '-d', config],
    { silent: true }
  );

  if (genResult.status !== 0) {
    const out = (genResult.stdout?.toString() || genResult.stderr?.toString() || '').trim();
    if (out.includes('No changes in database schema')) {
      process.stdout.write(fmt.ok('') + '\n');
      console.log('\n' + fmt.info('No entity changes detected — no migration needed'));
      return;
    }
    process.stdout.write(fmt.err('') + '\n');
    console.error(out.split('\n').map((l: string) => `  ${l}`).join('\n'));
    process.exit(1);
  }
  process.stdout.write(fmt.ok('') + '\n');

  // Find the generated file
  const files = fs.readdirSync(outputDir)
    .filter((f: string) => f.includes(`TEMP_${strippedName}`) && f.endsWith('.ts'))
    .sort()
    .reverse();

  if (!files.length) {
    console.error(fmt.err(`Generated file not found in ${outputDir}`));
    process.exit(1);
  }

  const tempFile = path.join(outputDir, files[0]);

  // Step 4 — classify SQL and detect phases
  process.stdout.write(`  ${fmt.step(4, 6, 'Auto-classify SQL')} `);
  
  try {
    const classification = classifyMigrationFile(tempFile);
    
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

  } catch (error) {
    process.stdout.write(fmt.err('') + '\n');
    console.error(fmt.err('Classification failed:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  // Step 5 — lifecycle splitting and generation
  process.stdout.write(`  ${fmt.step(5, 6, 'Lifecycle splitting')} `);

  try {
    // Extract SQL statements from the temporary file
    const fs = require('fs');
    const content = fs.readFileSync(tempFile, 'utf8');
    const sqlStatements = require('../migration-engine/detect-schema-diff').extractSqlStatements(content);

    // Get type information for better column type detection
    const typeMapResult = await detectSchemaDiffWithTypes(config);
    const typeMap = typeMapResult.typeMap;

    // Split into lifecycle phases with type information
    const splitter = new LifecycleSplitter();
    const lifecycleSet = splitter.split(sqlStatements, typeMap);

    // Generate companion migrations for complex operations
    const tableMatch = content.match(/ALTER\s+TABLE\s+"([^"]+)"/i);
    const tableName = tableMatch?.[1] || 'TABLE_NAME';
    const companions = splitter.generateCompanions(content, tableName);

    // Generate migration files
    const createdFiles = generateLifecycleMigrations(outputDir, strippedName, lifecycleSet, companions);

    // Clean up temporary file
    fs.unlinkSync(tempFile);

    process.stdout.write(fmt.ok('') + '\n');

    // Print summary
    console.log('');
    console.log(fmt.header('Generated Files'));

    createdFiles.forEach((f, i) => {
      const base = path.basename(f);
      const prefixMatch = VALID_PREFIXES.find((p) => base.includes(p));
      const prefix = prefixMatch ?? 'SAFE_';
      const phase = i === 0 ? 'Phase 1 (primary)' : `Phase ${i + 1} (companion)`;
      console.log(`  ${fmt.prefix(prefix)} ${c.bold}${base}${c.reset}`);
      console.log(`  ${c.dim}  ${phase} — ${outputDir}/${base}${c.reset}`);
      console.log('');
    });

  } catch (error) {
    process.stdout.write(fmt.err('') + '\n');
    console.error(fmt.err('Lifecycle splitting failed:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  // Step 6 — governance checks
  process.stdout.write(`  ${fmt.step(6, 6, 'Governance validation')} `);

  try {
    const governancePassed = runGovernanceChecks(true);
    if (!governancePassed) {
      process.stdout.write(fmt.err('') + '\n');
      console.error('\n' + fmt.err('Governance checks failed — migrations NOT applied'));
      console.error(`  Fix the issues above, then run: ${c.bold}npm run db:migrate${c.reset}`);
      process.exit(1);
    }
    process.stdout.write(fmt.ok('') + '\n');

  } catch (error) {
    process.stdout.write(fmt.err('') + '\n');
    console.error(fmt.err('Governance validation failed:'), error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  // ── Summary and Next Steps ─────────────────────────────────────────────────

  console.log(fmt.header('Next Steps'));
  console.log(`  1. ${c.bold}Review generated SQL${c.reset}`);
  console.log(`     Open the file(s) above — TypeORM's diff is a starting point, not final truth`);
  console.log(`  2. ${c.bold}Fill in the INTENT field${c.reset} in each file's header`);
  console.log(`  3. ${c.bold}Run:${c.reset} npm run db:migrate`);

  // Check for BREAKING migrations
  const hasBreaking = fs.readdirSync(outputDir)
    .some((f: string) => f.startsWith('BREAKING_') && f.endsWith('.ts'));

  if (hasBreaking) {
    console.log('');
    console.log(fmt.warn('BREAKING migration — requires @approved-breaking before CI will pass'));
    console.log(`     Add: @approved-breaking: <your name — reason this is safe>`);
  }
}

// ── CLI Definition ───────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const program = new Command();

  program
    .name('generate-migration')
    .description(
      `${c.bold}Automatically generate lifecycle migrations from entity changes${c.reset}\n\n` +
      `  This command detects entity changes, classifies operations, and generates\n` +
      `  SAFE/DATA/BREAKING migration files following the Expand → Migrate → Contract pattern.\n\n` +
      `  Examples:\n` +
      `    ${c.dim}npm run migrate:generate -- AddDriverRating${c.reset}\n` +
      `    ${c.dim}npm run migrate:generate -- AddDriverRating --output-dir src/migrations/pending${c.reset}\n` +
      `    ${c.dim}npm run migrate:generate -- AddDriverRating --config src/config/data-source.staging.ts${c.reset}`,
    )
    .version(VERSION, '-v, --version', 'Output the CLI version');

  // ── Arguments and Options ──────────────────────────────────────────────────

  program
    .argument('<name>', 'Migration name (prefixes auto-detected)')
    .option(
      '-o, --output-dir <path>',
      'Output directory for generated migrations',
      DEFAULT_OUT_DIR,
    )
    .option(
      '--config <path>',
      'Path to the TypeORM DataSource config file',
      DEFAULT_CONFIG,
    );

  program.parse(process.argv);
  const args = program.args;
  const opts = program.opts();

  // Validate arguments
  if (!args[0]) {
    console.error(fmt.err('Migration name is required'));
    console.error(`  Usage: ${c.bold}npm run migrate:generate -- <name>${c.reset}`);
    process.exit(1);
  }

  // Validate config file exists
  if (!fs.existsSync(opts.config)) {
    console.error(fmt.err(`Config file not found: ${opts.config}`));
    console.error(`  Provide a valid path with: ${c.bold}--config <path>${c.reset}`);
    process.exit(1);
  }

  // Run generation
  await runGenerate({
    name: args[0],
    outputDir: opts.outputDir,
    config: opts.config
  });
}

main().catch((err) => {
  console.error(fmt.err('Unexpected error:'), err instanceof Error ? err.message : String(err));
  process.exit(1);
});
