#!/usr/bin/env ts-node
/**
 * Test Script for Schema Planning Engine
 *
 * Tests the new schema planning system with sample operations.
 */

import {
  buildMigrationPlan,
  validateMigrationPlan,
} from "./migration-engine/schema-planner";

async function testSchemaPlanner() {
  console.log("🧪 Testing Schema Planning Engine...\n");

  try {
    // Test with a sample config (this would normally be your actual config)
    const configPath = "src/config/data-source.ts";

    console.log("📋 Building migration plan...");
    const plan = await buildMigrationPlan(configPath);

    console.log("\n📊 Migration Plan Summary:");
    console.log(`   Operations: ${plan.operations.length}`);
    console.log(`   Phases: ${plan.phases.length}`);
    console.log(`   Risks: ${plan.risks.length}`);
    console.log(
      `   Breaking Changes: ${plan.compatibility.breakingChanges.length}`,
    );

    console.log("\n🔍 Validating migration plan...");
    const validation = validateMigrationPlan(plan);

    console.log("\n✅ Validation Results:");
    console.log(`   Valid: ${validation.isValid ? "YES" : "NO"}`);
    console.log(`   Score: ${validation.score}/100`);
    console.log(`   Errors: ${validation.errors.length}`);
    console.log(`   Warnings: ${validation.warnings.length}`);

    if (validation.errors.length > 0) {
      console.log("\n❌ Errors:");
      validation.errors.forEach((error) => console.log(`   • ${error}`));
    }

    if (validation.warnings.length > 0) {
      console.log("\n⚠️  Warnings:");
      validation.warnings.forEach((warning) => console.log(`   • ${warning}`));
    }

    console.log("\n🎉 Schema planning engine test completed successfully!");
  } catch (error) {
    console.error(
      "💥 Test failed:",
      error instanceof Error ? error.message : String(error),
    );
    process.exit(1);
  }
}

// Run the test
testSchemaPlanner();
