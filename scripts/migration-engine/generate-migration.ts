/**
 * Migration File Generator
 * 
 * Generates properly formatted migration files with governance headers
 * and lifecycle splitting support.
 */

import * as fs from 'fs';
import * as path from 'path';
import { Prefix, MigrationLifecycleSet, CompanionMigration } from './types';

/**
 * Generate timestamp for migration files
 */
function generateTimestamp(): string {
  return Date.now().toString();
}

/**
 * Build migration file content with proper TypeScript structure
 */
function buildMigrationFile(
  className: string,
  sqlStatements: string[],
  header: string
): string {
  const upStatements = sqlStatements.map(sql => 
    `    await queryRunner.query(\`\n      ${sql}\n    \`\);`
  ).join('\n\n');

  return `import { MigrationInterface, QueryRunner } from 'typeorm';

${header}
export class ${className} implements MigrationInterface {
  name = '${className}';

  public async up(queryRunner: QueryRunner): Promise<void> {
${upStatements}
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // TODO: Implement rollback logic
    throw new Error('Manual rollback required — see ROLLBACK PLAN in header');
  }
}
`;
}

/**
 * Write a single migration file
 */
export function writeMigrationFile(
  outputDir: string,
  prefix: Prefix,
  name: string,
  sqlStatements: string[],
  header: string
): string {
  if (!sqlStatements.length) {
    return '';
  }

  const timestamp = generateTimestamp();
  const className = `${prefix.replace('_', '')}${name}${timestamp}`;
  const filename = `${timestamp}-${prefix}${name}.ts`;
  const filePath = path.join(outputDir, filename);

  const content = buildMigrationFile(className, sqlStatements, header);
  fs.writeFileSync(filePath, content);

  return filePath;
}

/**
 * Write companion migration files for complex operations
 */
export function writeCompanionMigrations(
  basePath: string,
  companions: CompanionMigration[],
  outputDir: string
): string[] {
  const createdFiles: string[] = [];

  companions.forEach((companion, index) => {
    const prefix: Prefix = companion.phase === 'DATA' ? 'DATA_' : 'BREAKING_';
    const timestamp = String(parseInt(path.basename(basePath).split('-')[0], 10) + index + 1);
    const name = path.basename(basePath, '.ts').split('-').slice(1).join('-');
    const className = `${prefix.replace('_', '')}${name}${timestamp}`;
    const filename = `${timestamp}-${prefix}${name}.ts`;
    const filePath = path.join(outputDir, filename);

    const header = buildCompanionHeader(companion.phase, companion.reason);
    const content = buildMigrationFile(className, [companion.sql], header);

    fs.writeFileSync(filePath, content);
    createdFiles.push(filePath);
  });

  return createdFiles;
}

/**
 * Build header for companion migrations
 */
function buildCompanionHeader(phase: 'DATA' | 'BREAKING', reason: string): string {
  const type = phase === 'DATA' ? 'DATA' : 'BREAKING';
  const riskMap: Record<string, string> = { DATA: 'MEDIUM', BREAKING: 'HIGH' };
  const rollMap: Record<string, string> = { DATA: 'SAFE', BREAKING: 'DATA_LOSS' };

  const breakingApproval = type === 'BREAKING'
    ? ` *\n * @approved-breaking: <REQUIRED — reviewer name + reason this is safe to deploy>\n`
    : '';

  const checklists: Record<string, string> = {
    DATA: ` *   [ ] Data integrity verified on staging\n *   [ ] Batched for >10k rows (add @large-batch + loop)\n *   [ ] No schema changes mixed in\n *   [ ] Tested migration:revert locally\n *   [ ] Passes: npm run db:verify`,
    BREAKING: ` *   [ ] @approved-breaking filled in with reviewer name and reason\n *   [ ] All app code no longer references dropped/changed column\n *   [ ] Backward-compat layer deployed before this migration\n *   [ ] Coordinated deploy window with team\n *   [ ] Tested migration:revert locally\n *   [ ] Passes: npm run db:verify`
  };

  return `/**
 * INTENT:    ${reason}
 * TYPE:      ${type}
 * RISK:      ${riskMap[type] ?? 'MEDIUM'}
 * ROLLBACK:  ${rollMap[type] ?? 'SAFE'}
${breakingApproval} *
 * CHECKLIST (mark [x] before merging):
${checklists[type] ?? checklists.DATA}
 */
`;
}

/**
 * Generate migration files for a complete lifecycle
 */
export function generateLifecycleMigrations(
  outputDir: string,
  name: string,
  lifecycleSet: MigrationLifecycleSet,
  companions: CompanionMigration[] = []
): string[] {
  const createdFiles: string[] = [];

  // Generate SAFE migration
  if (lifecycleSet.safe.length > 0) {
    const header = buildLifecycleHeader('SAFE', name, 'Expand', lifecycleSet.safe.length);
    const filePath = writeMigrationFile(outputDir, 'SAFE_', name, lifecycleSet.safe, header);
    if (filePath) createdFiles.push(filePath);
  }

  // Generate DATA migration
  if (lifecycleSet.data.length > 0) {
    const header = buildLifecycleHeader('DATA', name, 'Migrate', lifecycleSet.data.length);
    const filePath = writeMigrationFile(outputDir, 'DATA_', name, lifecycleSet.data, header);
    if (filePath) createdFiles.push(filePath);
  }

  // Generate BREAKING migration
  if (lifecycleSet.breaking.length > 0) {
    const header = buildLifecycleHeader('BREAKING', name, 'Contract', lifecycleSet.breaking.length);
    const filePath = writeMigrationFile(outputDir, 'BREAKING_', name, lifecycleSet.breaking, header);
    if (filePath) createdFiles.push(filePath);
  }

  // Generate companion migrations
  if (companions.length > 0) {
    const companionFiles = writeCompanionMigrations(createdFiles[0] || '', companions, outputDir);
    createdFiles.push(...companionFiles);
  }

  return createdFiles;
}

/**
 * Build lifecycle phase header
 */
function buildLifecycleHeader(
  type: string, 
  name: string, 
  phase: string, 
  statementCount: number
): string {
  const riskMap: Record<string, string> = { SAFE: 'LOW', DATA: 'MEDIUM', BREAKING: 'HIGH' };
  const rollMap: Record<string, string> = { SAFE: 'SAFE', DATA: 'SAFE', BREAKING: 'DATA_LOSS' };

  const breakingApproval = type === 'BREAKING'
    ? ` *\n * @approved-breaking: <REQUIRED — reviewer name + reason this is safe to deploy>\n`
    : '';

  const checklists: Record<string, string> = {
    SAFE: ` *   [ ] Reviewed generated SQL (not just the TypeScript)\n *   [ ] Uses IF NOT EXISTS / IF EXISTS for idempotency\n *   [ ] New indexes use CONCURRENTLY + transaction = false\n *   [ ] Tested migration:revert locally\n *   [ ] Passes: npm run db:verify`,
    DATA: ` *   [ ] Data integrity verified on staging\n *   [ ] Batched for >10k rows (add @large-batch + loop)\n *   [ ] No schema changes mixed in\n *   [ ] Tested migration:revert locally\n *   [ ] Passes: npm run db:verify`,
    BREAKING: ` *   [ ] @approved-breaking filled in with reviewer name and reason\n *   [ ] All app code no longer references dropped/changed column\n *   [ ] Backward-compat layer deployed before this migration\n *   [ ] Coordinated deploy window with team\n *   [ ] Tested migration:revert locally\n *   [ ] Passes: npm run db:verify`
  };

  return `/**
 * INTENT:    ${phase} phase for ${name} — ${statementCount} statement(s)
 * TYPE:      ${type}
 * RISK:      ${riskMap[type] ?? 'MEDIUM'}
 * ROLLBACK:  ${rollMap[type] ?? 'SAFE'}
${breakingApproval} *
 * CHECKLIST (mark [x] before merging):
${checklists[type] ?? checklists.SAFE}
 */
`;
}

/**
 * Validate migration file structure
 */
export function validateMigrationFile(filePath: string): boolean {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  const content = fs.readFileSync(filePath, 'utf8');
  
  // Check for required imports
  if (!content.includes('import { MigrationInterface, QueryRunner } from \'typeorm\'')) {
    return false;
  }

  // Check for required class structure
  if (!content.includes('implements MigrationInterface')) {
    return false;
  }

  // Check for required methods
  if (!content.includes('public async up(queryRunner: QueryRunner)')) {
    return false;
  }

  if (!content.includes('public async down(queryRunner: QueryRunner)')) {
    return false;
  }

  return true;
}

/**
 * Get all migration files in a directory
 */
export function getMigrationFiles(outputDir: string): string[] {
  if (!fs.existsSync(outputDir)) {
    return [];
  }

  return fs.readdirSync(outputDir)
    .filter(file => file.endsWith('.ts') && /^\d{13,}-/.test(file))
    .map(file => path.join(outputDir, file))
    .sort();
}