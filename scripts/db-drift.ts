#!/usr/bin/env ts-node

import "dotenv/config";
import dataSource from "../src/config/data-source";

type MigrationRow = {
  name: string;
};

async function detectDrift(): Promise<void> {
  await dataSource.initialize();
  try {
    const pending = await dataSource.showMigrations();
    const localMigrationNames = new Set(dataSource.migrations.map((m) => m.name));

    let executedMigrationNames = new Set<string>();
    try {
      const rows = (await dataSource.query(
        'SELECT name FROM "_migrations" ORDER BY id ASC',
      )) as MigrationRow[];
      executedMigrationNames = new Set(rows.map((row) => row.name));
    } catch {
      // migrations table may not exist yet on a fresh database
    }

    const missingLocally = [...executedMigrationNames].filter(
      (name) => !localMigrationNames.has(name),
    );

    if (!pending && !missingLocally.length) {
      console.log("✅ db:drift - no pending migrations and no history drift detected");
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
