import "dotenv/config";
import dataSource from "../src/config/data-source";
import { MIGRATION_ALIASES } from "./migration-aliases";

type MigrationRow = {
  name: string;
};

function normalize(name: string): string {
  return name.replace(/_/g, "");
}

function matchesAlias(name: string, set: Set<string>): boolean {
  const aliases = MIGRATION_ALIASES[name] || [];

  return aliases.some((a) => set.has(normalize(a)));
}

async function isFreshDatabase(dataSource: any): Promise<boolean> {
  const result = await dataSource.query(`
    SELECT EXISTS (
      SELECT FROM information_schema.tables
      WHERE table_name='_migrations'
    );
  `);

  return !result[0].exists;
}

async function checkDrift(): Promise<void> {
  await dataSource.initialize();

  if (await isFreshDatabase(dataSource)) {
    console.log(
      "Fresh database detected → skipping drift"
    );

    return;
  }

  try {
    const executedRows: MigrationRow[] = await dataSource.query(
      `SELECT name FROM _migrations ORDER BY id`,
    );

    const executed = executedRows.map((r) => normalize(r.name));

    const code = dataSource.migrations.map((m: any) =>
      normalize(m.name || m.constructor?.name),
    );

    const executedSet = new Set(executed);

    const codeSet = new Set(code);

    const missing = executed.filter(
      (n) => !codeSet.has(n) && !matchesAlias(n, codeSet),
    );

    const pending = code.filter(
      (n) => !executedSet.has(n) && !matchesAlias(n, executedSet),
    );

    if (!missing.length && !pending.length) {
      console.log("✅ db:drift check passed");

      return;
    }

    console.log("\n❌ db:drift detected");

    if (pending.length) {
      console.log("  - Pending migrations:");

      pending.forEach((n) => console.log(`    • ${n}`));
    }

    if (missing.length) {
      console.log("  - Executed migrations missing from code:");

      missing.forEach((n) => console.log(`    • ${n}`));
    }

    process.exit(1);
  } finally {
    await dataSource.destroy();
  }
}

checkDrift();
