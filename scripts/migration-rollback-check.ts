import * as fs from "fs";
import * as path from "path";

// TASK 5: Path Locked absolute resolution
const migrationsDir = path.resolve(process.cwd(), "src/migrations");

if (!fs.existsSync(migrationsDir)) {
  console.error("❌ Migration directory not found. Check project root.");
  process.exit(1);
}

const files = fs.readdirSync(migrationsDir);
let failed = false;

for (const file of files) {
  // Only check TypeScript migration files
  if (!file.endsWith(".ts") || file === "index.ts") continue;

  const content = fs.readFileSync(path.join(migrationsDir, file), "utf8");

  // Logic: A valid migration must contain both 'public async up' and 'public async down'
  // We use regex to ensure we are matching the method signature, not just comments.
  const hasUpMethod = /public\s+async\s+up\(/.test(content);
  const hasDownMethod = /public\s+async\s+down\(/.test(content);

  if (hasUpMethod && !hasDownMethod) {
    console.error(`❌ ROLLBACK COVERAGE MISSING: "${file}"`);
    console.error(
      `   Every migration must implement a 'down()' method to be reversible.`,
    );
    failed = true;
  }
}

if (failed) {
  console.log(
    "\n💡 Tip: Use 'npm run migration:revert' to test your rollback logic locally.",
  );
  process.exit(1);
}

console.log("✅ Rollback coverage verified (All migrations are reversible)");
