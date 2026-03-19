import * as fs from "fs";
import * as path from "path";

const migrationsDir = path.resolve(process.cwd(), "src/migrations");
const validPrefixes = ["SAFE_", "DATA_", "BREAKING_", "FIX_"];
let failed = false;

for (const file of fs.readdirSync(migrationsDir)) {
  if (!file.endsWith(".ts") || file === "index.ts") continue;

  const parts = file.split("-");
  if (parts.length < 2) {
    console.error(
      `❌ Invalid migration format (missing timestamp hyphen): ${file}`,
    );
    failed = true;
    continue;
  }

  // Enforce prefix immediately after the first hyphen
  const prefixPart = parts[1];
  const hasValidPrefix = validPrefixes.some((prefix) =>
    prefixPart.startsWith(prefix),
  );

  if (!hasValidPrefix) {
    console.error(`❌ Intent Prefix Violation: "${file}"`);
    console.error(
      `   Prefix must follow timestamp (e.g., 12345-SAFE_name.ts). Found: ${prefixPart}`,
    );
    failed = true;
  }
}

if (failed) process.exit(1);
console.log("✅ Migration intent verified (Prefix position correct)");
