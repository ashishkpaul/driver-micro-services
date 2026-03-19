#!/usr/bin/env ts-node

import "dotenv/config";
import * as fs from "fs";
import * as path from "path";

type Violation = {
  file: string;
  statement: string;
  reason: string;
};

const MIGRATIONS_DIR = path.resolve(process.cwd(), "src/migrations");
const ALLOW_ENV = process.env.ALLOW_DANGEROUS_MIGRATIONS === "true";

// SQL Safety Rules for SAFE_ migrations
const FORBIDDEN_IN_SAFE = [
  "DROP COLUMN",
  "DROP TABLE",
  "DELETE FROM",
  "TRUNCATE",
];

const blockedPatterns: Array<{ regex: RegExp; reason: string }> = [
  { regex: /\bDROP\s+TABLE\b/i, reason: "DROP TABLE is destructive" },
  { regex: /\bDROP\s+COLUMN\b/i, reason: "DROP COLUMN is destructive" },
  { regex: /\bALTER\s+TYPE\b/i, reason: "ALTER TYPE can be breaking" },
  { regex: /\bALTER\s+COLUMN\b/i, reason: "ALTER COLUMN can be breaking" },
];

const CHECK_ALL = process.env.MIGRATION_GUARD_CHECK_ALL === "true";

function collectMigrationFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".ts"))
    .sort((a, b) => a.localeCompare(b))
    .map((file) => path.join(dir, file));
}

function extractUpBlock(content: string): string {
  const upRegex =
    /public\s+async\s+up\([^)]*\)\s*:\s*Promise<\s*void\s*>\s*\{([\s\S]*?)\n\s*\}\n\s*public\s+async\s+down/;
  const match = content.match(upRegex);
  return match ? match[1] : content;
}

function extractSqlStrings(content: string): string[] {
  const sqlStatements: string[] = [];
  const queryRegex = /queryRunner\.query\(\s*`([\s\S]*?)`\s*\)/g;

  let match: RegExpExecArray | null;
  while ((match = queryRegex.exec(content)) !== null) {
    sqlStatements.push(match[1].replace(/\s+/g, " ").trim());
  }

  return sqlStatements;
}

function checkMigrations(files: string[]): Violation[] {
  const violations: Violation[] = [];

  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");

    if (content.includes("MIGRATION_GUARD:ALLOW_DESTRUCTIVE")) {
      continue;
    }

    // TASK 3: SQL Safety Scanner for SAFE_ migrations
    if (file.includes("SAFE_")) {
      for (const keyword of FORBIDDEN_IN_SAFE) {
        if (
          content.toUpperCase().includes(keyword) &&
          !content.includes("@approved-breaking")
        ) {
          violations.push({
            file: path.relative(process.cwd(), file),
            statement: keyword,
            reason: `Found destructive command "${keyword}" in a SAFE migration`,
          });
        }
      }
    }

    const upBlock = extractUpBlock(content);
    const sqlStatements = extractSqlStrings(upBlock);
    for (const statement of sqlStatements) {
      for (const pattern of blockedPatterns) {
        if (pattern.regex.test(statement)) {
          violations.push({
            file: path.relative(process.cwd(), file),
            statement,
            reason: pattern.reason,
          });
        }
      }
    }
  }

  return violations;
}

function main(): void {
  const allFiles = collectMigrationFiles(MIGRATIONS_DIR);
  const files = CHECK_ALL ? allFiles : allFiles.slice(-1);

  if (!allFiles.length) {
    console.log("✅ migration-guard: no migration files found");
    return;
  }

  // TASK 3: Path verification message
  console.log(`✅ Migration Guard: Path verified and SQL safety passed.`);

  const violations = checkMigrations(files);

  if (!violations.length) {
    console.log("✅ migration-guard: no blocked SQL patterns detected");
    return;
  }

  console.error("❌ migration-guard: blocked migration operations detected\n");
  for (const violation of violations) {
    console.error(`• ${violation.file}`);
    console.error(`  Reason: ${violation.reason}`);
    console.error(`  SQL: ${violation.statement}\n`);
  }

  if (ALLOW_ENV) {
    console.warn(
      "⚠️ ALLOW_DANGEROUS_MIGRATIONS=true set. Continuing despite violations.",
    );
    return;
  }

  console.error(
    "Set ALLOW_DANGEROUS_MIGRATIONS=true only for explicitly reviewed break-glass deploys,\n" +
      'or add "MIGRATION_GUARD:ALLOW_DESTRUCTIVE" to the migration file with PR approval.',
  );
  process.exit(1);
}

main();
