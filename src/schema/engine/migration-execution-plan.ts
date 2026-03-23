/**
 * Migration Execution Plan
 *
 * Single truth model for the entire migration system.
 * Replaces the inconsistent type models that were causing structural conflicts.
 */

import {
  SchemaOperation,
  PhasePlan,
  OperationGraph,
  RiskReport,
  CompatibilityReport,
  SchemaSnapshot,
  SchemaDiff,
} from "./types";

export interface MigrationExecutionPlan {
  /** All operations to be executed */
  operations: SchemaOperation[];

  /** Phase plans (EXPAND, DATA, CONTRACT, FIX) */
  phases: PhasePlan[];

  /** Execution order for all operations */
  executionOrder: string[];

  /** Dependency graph between operations */
  dependencies: Map<string, string[]>;

  /** Risk analysis reports */
  risks: RiskReport[];

  /** Compatibility analysis */
  compatibility: CompatibilityReport;

  /** Metadata for tracking and validation */
  metadata: {
    entitySnapshot: SchemaSnapshot;
    databaseSnapshot: SchemaSnapshot;
    diff: SchemaDiff;
    createdAt: string;
    version: string;
    planHash: string;
    simulationHash?: string;
  };
}

/**
 * Migration Execution Plan Builder
 *
 * Creates a unified execution plan from lifecycle phases
 */
export class MigrationExecutionPlanBuilder {
  /**
   * Build execution plan from lifecycle phases
   */
  public static buildFromPhases(
    phases: PhasePlan[],
    operations: SchemaOperation[],
    risks: RiskReport[],
    compatibility: CompatibilityReport,
    metadata: {
      entitySnapshot: SchemaSnapshot;
      databaseSnapshot: SchemaSnapshot;
      diff: SchemaDiff;
      createdAt: string;
      version: string;
    },
  ): MigrationExecutionPlan {
    // Build execution order from phases
    const executionOrder = this.buildExecutionOrder(phases);

    // Build dependency graph
    const dependencies = this.buildDependencies(phases);

    // Calculate plan hash for validation
    const planHash = this.calculatePlanHash(phases, operations);

    return {
      operations,
      phases,
      executionOrder,
      dependencies,
      risks,
      compatibility,
      metadata: {
        ...metadata,
        planHash,
      },
    };
  }

  /**
   * Build execution order from phases
   */
  private static buildExecutionOrder(phases: PhasePlan[]): string[] {
    const order: string[] = [];

    // Execute in phase order: EXPAND → DATA → CONTRACT → FIX
    for (const phase of phases) {
      order.push(...phase.order);
    }

    return order;
  }

  /**
   * Build dependency graph from phases
   */
  private static buildDependencies(phases: PhasePlan[]): Map<string, string[]> {
    const dependencies = new Map<string, string[]>();

    // Within each phase, respect operation dependencies
    for (const phase of phases) {
      for (const operation of phase.operations) {
        dependencies.set(operation.sql, operation.dependencies);
      }
    }

    // Add phase-level dependencies (later phases depend on earlier ones)
    for (let i = 1; i < phases.length; i++) {
      const currentPhase = phases[i];
      const previousPhase = phases[i - 1];

      for (const currentOp of currentPhase.operations) {
        const currentDeps = dependencies.get(currentOp.sql) || [];
        const previousOps = previousPhase.order;
        dependencies.set(currentOp.sql, [...currentDeps, ...previousOps]);
      }
    }

    return dependencies;
  }

  /**
   * Calculate plan hash for validation
   */
  private static calculatePlanHash(
    phases: PhasePlan[],
    operations: SchemaOperation[],
  ): string {
    const crypto = require("crypto");
    const planData = {
      phases: phases.map((p) => ({
        phase: p.phase,
        operations: p.operations.map((op) => op.sql),
        order: p.order,
      })),
      operations: operations.map((op) => op.sql),
    };

    return crypto
      .createHash("sha256")
      .update(JSON.stringify(planData))
      .digest("hex")
      .substring(0, 16);
  }

  /**
   * Validate execution plan integrity
   */
  public static validatePlan(plan: MigrationExecutionPlan): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for cycles in dependency graph
    const cycle = this.findCycle(plan.dependencies);
    if (cycle) {
      errors.push(`Dependency cycle detected: ${cycle.join(" → ")}`);
    }

    // Check execution order matches phases
    const expectedOrder = plan.phases.flatMap((p) => p.order);
    if (JSON.stringify(plan.executionOrder) !== JSON.stringify(expectedOrder)) {
      errors.push("Execution order does not match phase order");
    }

    // Check for missing operations
    const operationSqls = new Set(plan.operations.map((op) => op.sql));
    const orderSqls = new Set(plan.executionOrder);
    for (const sql of operationSqls) {
      if (!orderSqls.has(sql)) {
        warnings.push(`Operation not in execution order: ${sql}`);
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      score: this.calculatePlanScore(plan),
    };
  }

  /**
   * Find cycle in dependency graph using DFS
   */
  private static findCycle(
    dependencies: Map<string, string[]>,
  ): string[] | null {
    const visited = new Set<string>();
    const recStack = new Set<string>();
    const path: string[] = [];

    function dfs(node: string): string[] | null {
      if (recStack.has(node)) {
        // Found cycle
        const cycleStart = path.indexOf(node);
        return path.slice(cycleStart);
      }

      if (visited.has(node)) {
        return null;
      }

      visited.add(node);
      recStack.add(node);
      path.push(node);

      const deps = dependencies.get(node) || [];
      for (const dep of deps) {
        const cycle = dfs(dep);
        if (cycle) return cycle;
      }

      path.pop();
      recStack.delete(node);
      return null;
    }

    for (const [node] of dependencies) {
      const cycle = dfs(node);
      if (cycle) return cycle;
    }

    return null;
  }

  /**
   * Calculate plan score
   */
  private static calculatePlanScore(plan: MigrationExecutionPlan): number {
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
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  score: number;
}
