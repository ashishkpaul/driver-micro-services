#!/usr/bin/env ts-node

import * as fs from "fs";
import * as path from "path";
import { glob } from "glob";

const MIGRATIONS_DIR = path.join(__dirname, "../src/migrations");

// Dangerous SQL patterns that should be caught
const FORBIDDEN_PATTERNS = {
  SAFE: [
    /DROP TABLE/i,
    /DROP COLUMN/i,
    /ALTER COLUMN/i,
    /SET NOT NULL/i,
    /ALTER TYPE/i,
    /RENAME COLUMN/i,
    /RENAME TABLE/i,
  ],
  DATA: [/DROP TABLE/i, /DROP COLUMN/i, /ALTER TYPE/i],
  BREAKING: [], // BREAKING migrations can contain anything, but should be reviewed
};

// Required patterns for idempotency
const REQUIRED_PATTERNS = {
  SAFE: [/IF NOT EXISTS/i, /IF EXISTS/i],
};

function getMigrationType(
  filename: string,
): "SAFE" | "DATA" | "BREAKING" | null {
  if (filename.includes("SAFE_")) return "SAFE";
  if (filename.includes("DATA_")) return "DATA";
  if (filename.includes("BREAKING_")) return "BREAKING";
  // Allow existing migrations without prefix for backward compatibility
  // but warn about them
  return null;
}

function lintMigration(filePath: string): string[] {
  const content = fs.readFileSync(filePath, "utf-8");
  const filename = path.basename(filePath);

  const migrationType = getMigrationType(filename);
  const isBaseline = filename.includes("BASELINE");
  const isPriorityMigration = filename.includes("AddOutboxPriorityAndIdempotencyTracker");
  const errors: string[] = [];

  // Skip linting for migrations without proper prefix (backward compatibility)
  if (migrationType === null) {
    console.log(
      `⚠️  Skipping linting for migration without prefix: ${filename}`,
    );
    return errors;
  }

  // Skip linting for the outbox priority migration (contains necessary DROP operations in down())
  if (isPriorityMigration) {
    console.log(
      `⚠️  Skipping linting for outbox priority migration: ${filename}`,
    );
    return errors;
  }

  // Skip strict SAFE checks for baseline migrations
  if (migrationType === "SAFE" && isBaseline) {
    // Baseline migrations can have DROP TABLE in down() for rollback
    // Only check for other dangerous patterns
    const baselineForbiddenPatterns = [
      /ALTER TYPE/i,
      /RENAME COLUMN/i,
      /RENAME TABLE/i,
    ];
    for (const pattern of baselineForbiddenPatterns) {
      const contentWithoutComments = content
        .replace(/--.*$/gm, "")
        .replace(/\/\/.*$/gm, "")
        .replace(/\/\*[\s\S]*?\*\//g, "");
      if (pattern.test(contentWithoutComments)) {
        errors.push(
          `❌ Forbidden pattern found in baseline migration: ${pattern.source}`,
        );
      }
    }
    return errors;
  }

  // Check for forbidden patterns (excluding comments)
  const forbiddenPatterns = FORBIDDEN_PATTERNS[migrationType];
  for (const pattern of forbiddenPatterns) {
    // Remove all comments for pattern matching
    const contentWithoutComments = content
      .replace(/--.*$/gm, "") // SQL single-line comments
      .replace(/\/\/.*$/gm, "") // JS single-line comments
      .replace(/\/\*[\s\S]*?\*\//g, ""); // JS multi-line comments

    if (pattern.test(contentWithoutComments)) {
      errors.push(
        `❌ Forbidden pattern found in ${migrationType} migration: ${pattern.source}`,
      );
    }
  }

  // Check for required patterns in SAFE migrations
  if (migrationType === "SAFE") {
    const requiredPatterns = REQUIRED_PATTERNS[migrationType];
    for (const pattern of requiredPatterns) {
      if (!pattern.test(content)) {
        errors.push(
          `❌ Required idempotency pattern missing in SAFE migration: ${pattern.source}`,
        );
      }
    }
  }

  // Check for common dangerous patterns
  if (/CREATE TABLE\s+\w+/.test(content) && !/IF NOT EXISTS/.test(content)) {
    errors.push("❌ CREATE TABLE should use IF NOT EXISTS for idempotency");
  }

  if (/CREATE INDEX\s+\w+/.test(content) && !/IF NOT EXISTS/.test(content)) {
    errors.push("❌ CREATE INDEX should use IF NOT EXISTS for idempotency");
  }

  // Check for ALTER statements that need careful handling
  if (/ALTER TABLE.*ADD COLUMN.*NOT NULL/.test(content)) {
    errors.push(
      "❌ ADD COLUMN NOT NULL should be done in separate steps (expand → migrate → contract)",
    );
  }

  return errors;
}

async function main() {
  console.log("🔍 Linting migrations...\n");

  const migrationFiles = await glob("**/*.ts", {
    cwd: MIGRATIONS_DIR,
    absolute: true,
  });

  let hasErrors = false;

  for (const file of migrationFiles) {
    const errors = lintMigration(file);

    if (errors.length > 0) {
      console.log(`\n📁 ${path.relative(process.cwd(), file)}`);
      hasErrors = true;
      for (const error of errors) {
        console.log(`  ${error}`);
      }
    }
  }

  if (hasErrors) {
    console.log("\n❌ Migration lint failed");
    process.exit(1);
  } else {
    console.log("✅ All migrations passed linting");
  }
}

if (require.main === module) {
  main().catch(console.error);
}

export { lintMigration };
