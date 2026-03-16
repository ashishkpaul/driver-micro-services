#!/usr/bin/env ts-node

import { spawnSync } from "child_process";
import * as path from "path";

const VALID_PREFIXES = ["SAFE_", "DATA_", "BREAKING_"] as const;

function normalizeMigrationPath(inputName: string): string {
  const normalized = inputName.replace(/\\/g, "/").replace(/\.ts$/i, "");
  if (normalized.startsWith("src/migrations/")) {
    return normalized;
  }
  return `src/migrations/${normalized}`;
}

function validatePrefix(inputName: string): void {
  const baseName = path.basename(inputName).replace(/\.ts$/i, "");
  const hasValidPrefix = VALID_PREFIXES.some((prefix) => baseName.startsWith(prefix));

  if (!hasValidPrefix) {
    console.error("❌ migration:generate requires a prefixed migration name");
    console.error(`Use one of prefixes: ${VALID_PREFIXES.join(", ")}`);
    console.error("Example:");
    console.error("  npm run migration:generate -- SAFE_add_driver_rating");
    process.exit(1);
  }
}

function main(): void {
  const args = process.argv.slice(2);
  const migrationName = args[0];

  if (!migrationName) {
    console.error("❌ missing migration name");
    console.error("Usage: npm run migration:generate -- <SAFE_|DATA_|BREAKING_><name>");
    process.exit(1);
  }

  validatePrefix(migrationName);
  const targetPath = normalizeMigrationPath(migrationName);

  const result = spawnSync(
    "npm",
    [
      "run",
      "typeorm",
      "--",
      "migration:generate",
      targetPath,
      "-d",
      "src/config/data-source.ts",
      ...args.slice(1),
    ],
    { stdio: "inherit" },
  );

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

main();
