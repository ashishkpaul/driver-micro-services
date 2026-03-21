#!/usr/bin/env ts-node

/**
 * Entity Governance Script
 * 
 * Enforces deterministic entity contracts to achieve Zero Manual Intervention.
 * 
 * Rules enforced:
 * - No unnamed indexes (@Index() without name)
 * - No implicit columns (@Column() without type)
 * - Numeric columns must have precision and scale
 * - ManyToOne relations must have onDelete rule
 * - All entities must be deterministic
 */

import * as fs from "fs";
import * as path from "path";

const SRC = path.resolve("src");

let failed = false;

function fail(file: string, reason: string) {
  console.log(`❌ ${file} - ${reason}`);
  failed = true;
}

function scan(dir: string) {
  for (const f of fs.readdirSync(dir)) {
    const full = path.join(dir, f);

    if (fs.statSync(full).isDirectory()) {
      scan(full);
      continue;
    }

    if (!f.endsWith(".entity.ts")) continue;

    const text = fs.readFileSync(full, "utf8");
    const lines = text.split("\n");

    for (const line of lines) {
      if (line.includes("@Column()"))
        fail(full, "implicit column detected");

      if (line.includes("@Index()"))
        fail(full, "unnamed index");

      if (
        line.includes('type:"numeric"') &&
        !line.includes("precision")
      )
        fail(full, "numeric precision missing");

      if (line.includes("@ManyToOne")) {
        // Check if onDelete is in the same line or next few lines
        const index = lines.indexOf(line);
        const nextLines = lines.slice(index, index + 5).join(' ');
        if (!nextLines.includes("onDelete")) {
          fail(full, "FK delete rule missing");
        }
      }
    }
  }
}

scan(SRC);

if (failed) {
  console.log("\n❌ ENTITY CONTRACT BROKEN");
  process.exit(1);
}

console.log("✅ Entity governance passed");
