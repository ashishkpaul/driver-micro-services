/**
 * Operation Classification Engine
 * 
 * Intelligently classifies SQL operations as SAFE/DATA/BREAKING
 * based on TypeORM's SQL generation patterns and governance rules.
 */

import { SqlCategory, ClassifiedStatement } from './types';

/**
 * Classification rules for SQL operations
 * 
 * Rules are processed in order - BREAKING rules are checked first (most restrictive)
 */
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

/**
 * Classify a single SQL statement
 */
export function classifySqlStatement(sql: string): ClassifiedStatement {
  for (const rule of SQL_RULES) {
    if (rule.pattern.test(sql)) {
      return { sql, category: rule.category, reason: rule.reason };
    }
  }
  return { sql, category: 'SAFE', reason: 'Unrecognised statement — defaulting to SAFE' };
}

/**
 * Classify all statements in a migration file
 */
export function classifyMigrationFile(filePath: string): {
  categories: Set<SqlCategory>;
  statements: ClassifiedStatement[];
  dominantPrefix: string;
  needsPhaseDecomposition: boolean;
  phases: SqlCategory[];
} {
  const fs = require('fs');
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
  let dominantPrefix = 'SAFE_';
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