/**
 * Schema Planning Engine
 *
 * Central orchestration brain for the migration system.
 * Implements the complete schema planning pipeline from entity snapshots
 * to executable migration plans.
 */

import { DataSource } from "typeorm";
import {
  SchemaSnapshot,
  SchemaDiff,
  MigrationPlan,
  RiskReport,
  CompatibilityReport,
} from "./types";
import { buildEntitySnapshot } from "./entity-snapshot";
import { buildDatabaseSnapshot } from "./database-snapshot";
import { detectSchemaDiff } from "./detect-schema-diff";
import { classifyOperations } from "./classify-operations";
import { splitLifecycle } from "./lifecycle-split";
import { buildOperationGraph } from "./operation-graph";
import { analyzeRisk } from "./risk-analyzer";
import { checkCompatibility } from "./compatibility-check";

/**
 * Main schema planning orchestration
 */
export async function buildMigrationPlan(
  configPath: string,
): Promise<MigrationPlan> {
  console.log("🏗️  Building migration plan...");

  // Step 1: Build entity snapshot from TypeORM metadata
  console.log("  1. Building entity snapshot...");
  const entitySnapshot = await buildEntitySnapshot(configPath);

  // Step 2: Build database snapshot from actual schema
  console.log("  2. Building database snapshot...");
  const databaseSnapshot = await buildDatabaseSnapshot(configPath);

  // Step 3: Detect schema differences
  console.log("  3. Detecting schema differences...");
  const diff = await detectSchemaDiff(configPath);

  // Step 4: Classify operations by risk and type
  console.log("  4. Classifying operations...");
  const classified = classifyOperations(diff.up);

  // Step 5: Analyze risks and compatibility
  console.log("  5. Analyzing risks and compatibility...");
  const risks = analyzeRisk(classified);
  const compatibility = checkCompatibility(classified);

  // Step 6: Split into lifecycle phases
  console.log("  6. Splitting into lifecycle phases...");
  const lifecycle = splitLifecycle(classified);

  // Step 7: Build operation dependency graph
  console.log("  7. Building operation dependency graph...");
  const graph = buildOperationGraph(lifecycle);

  // Step 8: Generate final migration plan
  console.log("  8. Generating migration plan...");

  const plan: MigrationPlan = {
    operations: classified,
    phases: lifecycle,
    graph,
    risks,
    compatibility,
    metadata: {
      entitySnapshot,
      databaseSnapshot,
      diff,
      createdAt: new Date().toISOString(),
      version: "1.0.0",
    },
  };

  console.log(
    `✅ Migration plan built: ${classified.length} operations, ${lifecycle.phases.length} phases`,
  );

  return plan;
}

/**
 * Validate migration plan for production safety
 */
export function validateMigrationPlan(plan: MigrationPlan): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check for critical risks
  const criticalRisks = plan.risks.filter((r) => r.severity === "CRITICAL");
  if (criticalRisks.length > 0) {
    errors.push(
      `Critical risks detected: ${criticalRisks.map((r) => r.operation).join(", ")}`,
    );
  }

  // Check for breaking compatibility
  if (plan.compatibility.breakingChanges.length > 0) {
    errors.push(
      `Breaking compatibility changes detected: ${plan.compatibility.breakingChanges.join(", ")}`,
    );
  }

  // Check for large table operations
  const largeTableOps = plan.operations.filter(
    (op) => op.metadata?.tableSize === "LARGE",
  );
  if (largeTableOps.length > 0) {
    warnings.push(
      `Large table operations detected: ${largeTableOps.map((op) => op.sql).join(", ")}`,
    );
  }

  // Check for mixed phases in single migration
  const mixedPhaseOperations = plan.phases.filter(
    (phase) =>
      phase.operations.some((op) => op.category === "BREAKING") &&
      phase.operations.some((op) => op.category !== "BREAKING"),
  );
  if (mixedPhaseOperations.length > 0) {
    errors.push(
      `Mixed phase operations detected in phases: ${mixedPhaseOperations.map((p) => p.phase).join(", ")}`,
    );
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    score: calculatePlanScore(plan),
  };
}

/**
 * Calculate overall migration plan score
 */
function calculatePlanScore(plan: MigrationPlan): number {
  let score = 100;

  // Deduct points for risks
  plan.risks.forEach((risk) => {
    switch (risk.severity) {
      case "LOW":
        score -= 5;
        break;
      case "MEDIUM":
        score -= 15;
        break;
      case "HIGH":
        score -= 30;
        break;
      case "CRITICAL":
        score -= 50;
        break;
    }
  });

  // Deduct points for breaking changes
  if (plan.compatibility.breakingChanges.length > 0) {
    score -= plan.compatibility.breakingChanges.length * 25;
  }

  // Deduct points for large tables
  const largeTableOps = plan.operations.filter(
    (op) => op.metadata?.tableSize === "LARGE",
  );
  score -= largeTableOps.length * 20;

  return Math.max(0, score);
}

/**
 * Export types for external use
 */
export type { MigrationPlan, ValidationResult } from "./types";
