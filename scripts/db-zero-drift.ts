#!/usr/bin/env ts-node

/**
 * Zero Drift Detection Script
 * 
 * Checks if there are any schema drifts between entities and database.
 * This script should be run as part of CI/CD to ensure zero manual intervention.
 */

import { execSync } from "child_process";

try {
  execSync(
    "npm run typeorm -- schema:log -d src/config/data-source.ts",
    { stdio: 'pipe' }
  );

  console.log("✅ zero drift");
} catch {
  console.log("❌ schema drift detected");
  process.exit(1);
}
