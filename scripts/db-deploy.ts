#!/usr/bin/env ts-node

import "dotenv/config";
import dataSource from "../src/config/data-source";

type ExistsRow = { exists: boolean };

async function tableExists(tableName: string): Promise<boolean> {
  const rows = (await dataSource.query(
    `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = $1
      ) AS exists
    `,
    [tableName],
  )) as ExistsRow[];

  return !!rows?.[0]?.exists;
}

async function shouldBaselineExistingSchema(): Promise<boolean> {
  const hasDrivers = await tableExists("drivers");
  const hasDeliveries = await tableExists("deliveries");
  const hasAdminUsers = await tableExists("admin_users");

  return hasDrivers || hasDeliveries || hasAdminUsers;
}

async function deployMigrations(): Promise<void> {
  console.log("🚀 db:deploy - running migrations in controlled mode");

  await dataSource.initialize();
  try {
    const pending = await dataSource.showMigrations();
    if (!pending) {
      console.log("✅ No pending migrations");
      return;
    }

    const hasExistingSchema = await shouldBaselineExistingSchema();
    if (hasExistingSchema) {
      console.warn(
        "⚠️ Existing schema detected with pending migration history. Baseline-marking migrations as executed.",
      );
      const faked = await dataSource.runMigrations({
        transaction: "each",
        fake: true,
      });

      if (!faked.length) {
        console.log("✅ No migrations were baseline-marked");
        return;
      }

      console.log("✅ Baseline-marked migrations:");
      for (const migration of faked) {
        console.log(`   - ${migration.name}`);
      }
      return;
    }

    const results = await dataSource.runMigrations({ transaction: "each" });
    if (!results.length) {
      console.log("✅ No migrations were applied");
      return;
    }

    console.log("✅ Applied migrations:");
    for (const result of results) {
      console.log(`   - ${result.name}`);
    }
  } finally {
    await dataSource.destroy();
  }
}

deployMigrations().catch((error) => {
  console.error("❌ db:deploy failed:", error?.message || error);
  process.exit(1);
});
