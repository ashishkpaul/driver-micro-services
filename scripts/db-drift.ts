#!/usr/bin/env ts-node

import "dotenv/config";
import dataSource from "../src/config/data-source";
import { MIGRATION_ALIASES } from "./migration-aliases";

type MigrationRow = {
  name: string;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function hasLocalMigrationOrAlias(
  migrationName: string,
  localMigrationNames: Set<string>,
): boolean {
  if (localMigrationNames.has(migrationName)) {
    return true;
  }

  const aliases = MIGRATION_ALIASES[migrationName] ?? [];
  return aliases.some((alias) => localMigrationNames.has(alias));
}

async function detectDrift(): Promise<void> {
  await dataSource.initialize();
  try {
    const pending = await dataSource.showMigrations();
    const localMigrationNames = new Set(
      dataSource.migrations
        .map((m) => m.name)
        .filter((name): name is string => isNonEmptyString(name)),
    );

    let executedMigrationNames = new Set<string>();
    try {
      const rows = (await dataSource.query(
        'SELECT name FROM "_migrations" ORDER BY id ASC',
      )) as MigrationRow[];
      executedMigrationNames = new Set(rows.map((row) => row.name));
    } catch {
      // migrations table may not exist yet on a fresh database
    }

    const missingLocally = [...executedMigrationNames].filter((name) => {
      // Allow legacy migrations to be missing if environment variable is set
      const allowLegacy = process.env.DB_DRIFT_ALLOW_LEGACY === "true";
      if (allowLegacy && !hasLocalMigrationOrAlias(name, localMigrationNames)) {
        // Check if this is a legacy migration (no prefix)
        const isLegacy = !name.match(/^(SAFE_|DATA_|BREAKING_)/);
        if (isLegacy) {
          return false; // Don't report as missing
        }
      }
      return !hasLocalMigrationOrAlias(name, localMigrationNames);
    });

    if (!pending && !missingLocally.length) {
      console.log(
        "✅ db:drift - no pending migrations and no history drift detected",
      );
      return;
    }

    console.error("❌ db:drift detected");
    if (pending) {
      console.error("  - Pending migrations exist");
    }

    if (missingLocally.length) {
      console.error("  - Executed migrations missing from codebase:");
      for (const migrationName of missingLocally) {
        console.error(`    • ${migrationName}`);
      }
    }

    process.exit(1);
  } finally {
    await dataSource.destroy();
  }
}

detectDrift().catch((error) => {
  console.error("❌ db:drift failed:", error?.message || error);
  process.exit(1);
});
