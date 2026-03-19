import * as fs from "fs";
import * as path from "path";

// TASK 4: Absolute path resolution for safety
const migrationsDir = path.resolve(process.cwd(), "src/migrations");

if (!fs.existsSync(migrationsDir)) {
  console.error("❌ Migration directory not found.");
  process.exit(1);
}

const files = fs
  .readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".ts") && f !== "index.ts")
  .sort((a, b) => {
    const ta = parseInt(a.split("-")[0], 10);
    const tb = parseInt(b.split("-")[0], 10);
    return ta - tb; // Numeric ascending order
  });

let lastTimestamp = 0;

for (const file of files) {
  // Logic: Extract the first numeric part before the first hyphen
  // Example: 1710850000000-SAFE_add_column.ts -> 1710850000000
  const timestampPart = file.split("-")[0];
  const currentTimestamp = parseInt(timestampPart, 10);

  if (isNaN(currentTimestamp)) {
    console.warn(`⚠️  Skipping non-timestamped file: ${file}`);
    continue;
  }

  if (currentTimestamp < lastTimestamp) {
    console.error(`❌ MIGRATION ORDER BROKEN:`);
    console.error(
      `   "${file}" has an older timestamp than previous migrations.`,
    );
    console.error(`   This will cause failures in strict CI environments.`);
    process.exit(1);
  }

  lastTimestamp = currentTimestamp;
}

console.log("✅ Migration order verified (Chronological)");
