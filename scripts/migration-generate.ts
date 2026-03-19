#!/usr/bin/env ts-node

import { spawnSync } from "child_process";
import * as path from "path";
import * as fs from "fs";

const VALID_PREFIXES = ["SAFE_", "DATA_", "BREAKING_", "FIX_"] as const;

function normalizeMigrationPath(inputName: string): string {
  const normalized = inputName.replace(/\\/g, "/").replace(/\.ts$/i, "");
  if (normalized.startsWith("src/migrations/")) {
    return normalized;
  }
  return `src/migrations/${normalized}`;
}

function validatePrefix(inputName: string): void {
  const baseName = path.basename(inputName).replace(/\.ts$/i, "");
  const hasValidPrefix = VALID_PREFIXES.some((prefix) =>
    baseName.startsWith(prefix),
  );

  if (!hasValidPrefix) {
    console.error("❌ migration:generate requires a prefixed migration name");
    console.error(`Use one of prefixes: ${VALID_PREFIXES.join(", ")}`);
    console.error("Example:");
    console.error("  npm run migration:generate -- SAFE_add_driver_rating");
    process.exit(1);
  }
}

function addIntentCommentAndChecklist(filePath: string, prefix: string): void {
  if (!fs.existsSync(filePath)) return;

  const content = fs.readFileSync(filePath, "utf8");

  // Determine intent type and checklist items
  const intentType =
    prefix === "SAFE_"
      ? "SAFE"
      : prefix === "DATA_"
        ? "DATA"
        : prefix === "BREAKING_"
          ? "BREAKING"
          : "FIX";

  const checklistItems = getChecklistItems(intentType);
  const checklist = checklistItems.map((item) => ` * ${item}`).join("\n");

  const intentComment = `/**
 * MIGRATION INTENT: ${intentType}
 * 
 * Checklist (mark completed items with [x]):
${checklist}
 * 
 * Notes:
 * - This migration was generated with automated intent validation
 * - Ensure all checklist items are completed before merging
 * - Test rollback functionality for reversible migrations
 */

`;

  // Insert comment after the import statements
  const lines = content.split("\n");
  let insertIndex = 0;

  // Find the end of imports (first non-import line)
  for (let i = 0; i < lines.length; i++) {
    if (!lines[i].startsWith("import ") && lines[i].trim() !== "") {
      insertIndex = i;
      break;
    }
  }

  lines.splice(insertIndex, 0, intentComment);
  fs.writeFileSync(filePath, lines.join("\n"));
}

function getChecklistItems(intentType: string): string[] {
  switch (intentType) {
    case "SAFE":
      return [
        "[ ] Verify no destructive SQL operations (DROP, DELETE, TRUNCATE)",
        "[ ] Confirm backward compatibility with existing PWA versions",
        "[ ] Test migration on staging environment",
        "[ ] Verify rollback functionality works correctly",
        "[ ] Update any affected API documentation",
      ];
    case "DATA":
      return [
        "[ ] Verify data integrity after migration",
        "[ ] Test rollback preserves data consistency",
        "[ ] Confirm no schema changes that break existing code",
        "[ ] Validate data seeding logic",
        "[ ] Test on representative dataset",
      ];
    case "BREAKING":
      return [
        "[ ] Coordinate with PWA team for simultaneous deployment",
        "[ ] Verify all dependent services are updated",
        "[ ] Test rollback procedure thoroughly",
        "[ ] Update API contracts and documentation",
        "[ ] Plan deployment window with stakeholders",
      ];
    case "FIX":
      return [
        "[ ] Document the issue being fixed",
        "[ ] Verify the fix addresses the root cause",
        "[ ] Test rollback procedure",
        "[ ] Confirm no new side effects introduced",
        "[ ] Update relevant documentation",
      ];
    default:
      return [];
  }
}

function main(): void {
  const args = process.argv.slice(2);
  const migrationName = args[0];

  if (!migrationName) {
    console.error("❌ missing migration name");
    console.error(
      "Usage: npm run migration:generate -- <SAFE_|DATA_|BREAKING_|FIX_><name>",
    );
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

  // Add intent comment and checklist to the generated migration
  const generatedFile = `${targetPath}.ts`;
  const prefix = VALID_PREFIXES.find((p) => migrationName.startsWith(p)) || "";

  if (prefix) {
    addIntentCommentAndChecklist(generatedFile, prefix);
    console.log(`✅ Migration generated with ${prefix} intent validation`);
    console.log(`📝 Added automated checklist to ${generatedFile}`);
  }
}

main();
