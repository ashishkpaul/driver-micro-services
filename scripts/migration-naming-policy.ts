#!/usr/bin/env ts-node

import * as fs from "fs";
import * as path from "path";

const MIGRATIONS_DIR = path.resolve(process.cwd(), "src/migrations");
const VALID_PREFIXES = ["SAFE_", "DATA_", "BREAKING_"] as const;

const ENFORCED_PATTERN = new RegExp(
  `^\\d{13,}-(?:${VALID_PREFIXES.map((p) => p.replace("_", "\\_").replace("+", "\\+")).join("|")}).+\\.ts$`,
);
const LEGACY_PATTERN = /^\d{13,}-[A-Za-z0-9_-]+\.ts$/;
const ALLOW_LEGACY = process.env.MIGRATION_NAMING_ALLOW_LEGACY === "true";
const CHECK_ALL = process.env.MIGRATION_NAMING_CHECK_ALL === "true";

function validateMigrationBaseName(baseName: string): void {
  const hasValidPrefix = VALID_PREFIXES.some((prefix) =>
    baseName.startsWith(prefix),
  );
  if (!hasValidPrefix) {
    console.error("❌ migration naming policy violation");
    console.error(
      `Migration name must start with one of: ${VALID_PREFIXES.join(", ")}. Received: ${baseName}`,
    );
    process.exit(1);
  }

  console.log(`✅ migration naming policy passed for: ${baseName}`);
}

function checkExistingMigrations(): void {
  if (!fs.existsSync(MIGRATIONS_DIR)) {
    console.log("✅ migration naming policy: migrations directory not found");
    return;
  }

  const allFiles = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".ts"))
    .sort((a, b) => a.localeCompare(b));

  const filesToCheck = CHECK_ALL ? allFiles : allFiles.slice(-1);
  const invalid = filesToCheck.filter((file) => {
    if (ENFORCED_PATTERN.test(file)) {
      return false;
    }

    if (ALLOW_LEGACY && LEGACY_PATTERN.test(file)) {
      return false;
    }

    return true;
  });

  if (!invalid.length) {
    console.log(
      "✅ migration naming policy: no invalid migration filenames detected",
    );
    return;
  }

  // If legacy migrations are allowed, warn but don't fail
  if (ALLOW_LEGACY) {
    console.log(
      "⚠️  migration naming policy: legacy migrations allowed, skipping:",
    );
    for (const file of invalid) {
      console.log(`  • src/migrations/${file}`);
    }
    return;
  }

  console.error("❌ migration naming policy violation in files:");
  for (const file of invalid) {
    console.error(`  • src/migrations/${file}`);
  }
  console.error(
    `Use naming format: <timestamp>-${VALID_PREFIXES.join("|")}<name>.ts (legacy allowed: ${ALLOW_LEGACY})`,
  );
  process.exit(1);
}

function main(): void {
  const candidateName = process.argv[2];
  if (candidateName) {
    const normalized =
      candidateName.replace(/\\/g, "/").split("/").pop() || candidateName;
    validateMigrationBaseName(normalized.replace(/\.ts$/i, ""));
    return;
  }

  checkExistingMigrations();
}

main();
