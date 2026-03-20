import * as fs from "fs";
import * as path from "path";

// TASK 6: Path Locked absolute resolution
const migrationsDir = path.resolve(process.cwd(), "src/migrations");

if (!fs.existsSync(migrationsDir)) {
  console.error("❌ Migration directory not found.");
  process.exit(1);
}

const files = fs.readdirSync(migrationsDir);
let failed = false;

for (const file of files) {
  if (!file.endsWith(".ts") || file === "index.ts") continue;

  const content = fs.readFileSync(path.join(migrationsDir, file), "utf8");

  // Logic: PostgreSQL does not allow 'CREATE INDEX CONCURRENTLY' inside a transaction.
  // TypeORM migrations run in a transaction by default unless 'transaction = false' is set.
  const concurrentPattern = /(CREATE|DROP)\s+INDEX\s+CONCURRENTLY/i;
  const containsConcurrently = concurrentPattern.test(content);
  const hasTransactionDisabled = /transaction\s*=\s*false/.test(content);

  if (containsConcurrently && !hasTransactionDisabled) {
    console.error(`❌ TRANSACTION SAFETY VIOLATION: "${file}"`);
    console.error(
      `   Found 'CONCURRENTLY' keyword, but 'transaction = false' is missing.`,
    );
    console.error(`   PostgreSQL will reject this migration during execution.`);
    failed = true;
  }
}

if (failed) {
  console.log(
    "\n💡 Tip: Add 'public transaction = false;' to your Migration class definition.",
  );
  process.exit(1);
}

console.log("✅ Transaction safety verified (Concurrent indexes safe)");
