/**
 * Execution Planner
 *
 * Handles dependency resolution and ensures proper execution order.
 * This fixes the simulation errors and missing table issues.
 * Integrates with the Background Backfill Engine for zero-downtime data migrations.
 */

import { MigrationExecutionPlan } from "./migration-execution-plan";
import { MigrationState, MigrationStateRuntime } from "./migration-state";
import { MigrationReplayEngine } from "./migration-replay";
import { BackfillJob, BackfillJobStatus } from "../entities/backfill-job.entity";

export interface ExecutionOrder {
  phases: string[];
  operations: string[];
  dependencies: Map<string, string[]>;
}

export interface SimulationResult {
  success: boolean;
  errors: string[];
  warnings: string[];
  executionOrder: string[];
  estimatedTime: string;
}

/**
 * Execution Planner
 *
 * Resolves dependencies and builds execution order for migrations
 */
export class ExecutionPlanner {
  private stateRuntime: MigrationStateRuntime;

  constructor(stateRuntime: MigrationStateRuntime) {
    this.stateRuntime = stateRuntime;
  }

  /**
   * Resolve execution order from migration plan
   */
  public resolveExecutionOrder(plan: MigrationExecutionPlan): ExecutionOrder {
    console.log("  Resolving execution order...");

    // Build dependency graph
    const dependencies = this.buildDependencyGraph(plan);

    // Perform topological sort
    const executionOrder = this.topologicalSort(
      dependencies,
      plan.executionOrder,
    );

    // Group by phases
    const phases = this.groupByPhases(plan.phases, executionOrder);

    return {
      phases,
      operations: executionOrder,
      dependencies,
    };
  }

  /**
   * Build dependency graph from plan
   */
  private buildDependencyGraph(
    plan: MigrationExecutionPlan,
  ): Map<string, string[]> {
    const dependencies = new Map<string, string[]>();

    // Add explicit dependencies from operations
    for (const operation of plan.operations) {
      dependencies.set(operation.sql, operation.dependencies);
    }

    // Add phase-level dependencies
    for (let i = 1; i < plan.phases.length; i++) {
      const currentPhase = plan.phases[i];
      const previousPhase = plan.phases[i - 1];

      for (const currentOp of currentPhase.operations) {
        const currentDeps = dependencies.get(currentOp.sql) || [];
        const previousOps = previousPhase.order;
        dependencies.set(currentOp.sql, [...currentDeps, ...previousOps]);
      }
    }

    return dependencies;
  }

  /**
   * Topological sort for dependency resolution
   */
  private topologicalSort(
    dependencies: Map<string, string[]>,
    operations: string[],
  ): string[] {
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const result: string[] = [];

    function visit(node: string): void {
      if (visiting.has(node)) {
        throw new Error(`Circular dependency detected at: ${node}`);
      }

      if (visited.has(node)) {
        return;
      }

      visiting.add(node);
      const deps = dependencies.get(node) || [];

      for (const dep of deps) {
        if (operations.includes(dep)) {
          visit(dep);
        }
      }

      visiting.delete(node);
      visited.add(node);
      result.push(node);
    }

    // Visit all operations in order
    for (const op of operations) {
      if (!visited.has(op)) {
        visit(op);
      }
    }

    return result;
  }

  /**
   * Group operations by phases
   */
  private groupByPhases(phases: any[], executionOrder: string[]): string[] {
    const phaseOrder: string[] = [];

    for (const phase of phases) {
      if (executionOrder.some((op) => phase.order.includes(op))) {
        phaseOrder.push(phase.phase);
      }
    }

    return phaseOrder;
  }

  /**
   * Simulate migration execution
   */
  public async simulateExecution(
    plan: MigrationExecutionPlan,
    migrationId: string,
  ): Promise<SimulationResult> {
    console.log(`  Simulating execution for migration ${migrationId}...`);

    try {
      // Resolve execution order
      const executionOrder = this.resolveExecutionOrder(plan);

      // Validate dependencies
      const validation = this.validateDependencies(plan, executionOrder);

      if (!validation.success) {
        return {
          success: false,
          errors: validation.errors,
          warnings: validation.warnings,
          executionOrder: [],
          estimatedTime: "0s",
        };
      }

      // Estimate execution time
      const estimatedTime = this.estimateExecutionTime(plan);

      // Store simulation hash for validation
      const simulationHash = this.calculateSimulationHash(plan, executionOrder);
      const record = this.stateRuntime.getState(migrationId);
      if (record) {
        record.metadata = {
          ...record.metadata,
          simulationHash,
        };
        this.stateRuntime.updateState(migrationId, MigrationState.SIMULATED);
      }

      return {
        success: true,
        errors: [],
        warnings: validation.warnings,
        executionOrder: executionOrder.operations,
        estimatedTime,
      };
    } catch (error) {
      return {
        success: false,
        errors: [error instanceof Error ? error.message : String(error)],
        warnings: [],
        executionOrder: [],
        estimatedTime: "0s",
      };
    }
  }

  /**
   * Validate dependencies for simulation
   */
  private validateDependencies(
    plan: MigrationExecutionPlan,
    executionOrder: ExecutionOrder,
  ): { success: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for missing dependencies
    for (const [operation, deps] of executionOrder.dependencies) {
      for (const dep of deps) {
        if (!executionOrder.operations.includes(dep)) {
          errors.push(`Missing dependency: ${operation} depends on ${dep}`);
        }
      }
    }

    // Check for table existence assumptions
    const tableCreations = new Set<string>();
    const tableDrops = new Set<string>();

    for (const op of plan.operations) {
      const table = this.extractTableName(op.sql);
      if (table) {
        if (op.sql.toUpperCase().includes("CREATE TABLE")) {
          tableCreations.add(table);
        } else if (op.sql.toUpperCase().includes("DROP TABLE")) {
          tableDrops.add(table);
        }
      }
    }

    // Check for operations on non-existent tables
    for (const op of plan.operations) {
      const table = this.extractTableName(op.sql);
      if (table && !tableCreations.has(table) && !tableDrops.has(table)) {
        errors.push(
          `Operation on table ${table} - table must exist before migration`,
        );
      }
    }

    return {
      success: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Estimate execution time based on operation metadata
   */
  private estimateExecutionTime(plan: MigrationExecutionPlan): string {
    let totalSeconds = 0;

    for (const operation of plan.operations) {
      const metadata = operation.metadata;
      if (metadata?.estimatedTime) {
        const time = this.parseTimeEstimate(metadata.estimatedTime);
        totalSeconds += time;
      } else {
        // Default estimates based on category
        switch (operation.category) {
          case "SAFE":
            totalSeconds += 30; // 30 seconds
            break;
          case "DATA":
            totalSeconds += 300; // 5 minutes
            break;
          case "BREAKING":
            totalSeconds += 600; // 10 minutes
            break;
        }
      }
    }

    if (totalSeconds < 60) {
      return `${totalSeconds}s`;
    } else if (totalSeconds < 3600) {
      return `${Math.floor(totalSeconds / 60)}m ${totalSeconds % 60}s`;
    } else {
      return `${Math.floor(totalSeconds / 3600)}h ${Math.floor((totalSeconds % 3600) / 60)}m`;
    }
  }

  /**
   * Parse time estimate string to seconds
   */
  private parseTimeEstimate(timeStr: string): number {
    const match = timeStr.match(/(\d+)([smh])/);
    if (!match) return 300; // Default 5 minutes

    const value = parseInt(match[1]);
    const unit = match[2];

    switch (unit) {
      case "s":
        return value;
      case "m":
        return value * 60;
      case "h":
        return value * 3600;
      default:
        return 300;
    }
  }

  /**
   * Extract table name from SQL statement
   */
  private extractTableName(sql: string): string | null {
    // Match CREATE TABLE, ALTER TABLE, DROP TABLE, etc.
    const patterns = [
      /CREATE\s+TABLE\s+["']?(\w+)/i,
      /ALTER\s+TABLE\s+["']?(\w+)/i,
      /DROP\s+TABLE\s+["']?(\w+)/i,
      /INSERT\s+INTO\s+["']?(\w+)/i,
      /UPDATE\s+["']?(\w+)/i,
      /DELETE\s+FROM\s+["']?(\w+)/i,
    ];

    for (const pattern of patterns) {
      const match = sql.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * Calculate simulation hash for validation
   */
  private calculateSimulationHash(
    plan: MigrationExecutionPlan,
    executionOrder: ExecutionOrder,
  ): string {
    const crypto = require("crypto");
    const simulationData = {
      planHash: plan.metadata.planHash,
      executionOrder: executionOrder.operations,
      dependencies: Object.fromEntries(executionOrder.dependencies),
    };

    return crypto
      .createHash("sha256")
      .update(JSON.stringify(simulationData))
      .digest("hex")
      .substring(0, 16);
  }

  /**
   * Validate simulation consistency before execution
   */
  public validateSimulationConsistency(
    migrationId: string,
    planHash: string,
  ): boolean {
    const record = this.stateRuntime.getState(migrationId);
    if (!record) {
      return false;
    }

    // Check plan hash consistency
    if (record.planHash !== planHash) {
      return false;
    }

    // Check simulation was completed
    return record.state === MigrationState.SIMULATED;
  }

  /**
   * Get execution readiness check
   */
  public getExecutionReadiness(plan: MigrationExecutionPlan): {
    ready: boolean;
    issues: string[];
    recommendations: string[];
  } {
    const issues: string[] = [];
    const recommendations: string[] = [];

    // Check for critical operations
    const criticalOps = plan.operations.filter(
      (op) => op.category === "BREAKING" && op.metadata?.requiresDowntime,
    );

    if (criticalOps.length > 0) {
      issues.push(`${criticalOps.length} operations require downtime`);
      recommendations.push("Schedule maintenance window for breaking changes");
    }

    // Check for large table operations
    const largeTableOps = plan.operations.filter(
      (op) => op.metadata?.tableSize === "LARGE",
    );

    if (largeTableOps.length > 0) {
      recommendations.push(
        "Consider running large table operations during low-traffic periods",
      );
    }

    // Check for data operations that might need validation
    const dataOps = plan.operations.filter((op) => op.category === "DATA");
    if (dataOps.length > 0) {
      recommendations.push(
        "Validate data integrity after migration completion",
      );
    }

    return {
      ready: issues.length === 0,
      issues,
      recommendations,
    };
  }

  /**
   * Create backfill jobs for DATA phases instead of executing them synchronously
   */
  public async createBackfillJobs(
    plan: MigrationExecutionPlan,
    migrationId: string,
    dataSource: any, // TypeORM DataSource
  ): Promise<BackfillJob[]> {
    const backfillJobs: BackfillJob[] = [];
    const dataPhases = plan.phases.filter(phase => phase.phase === 'DATA');

    for (const phase of dataPhases) {
      for (const operation of phase.operations) {
        if (operation.category === 'DATA') {
          const tableName = this.extractTableName(operation.sql);
          if (!tableName) {
            console.warn(`Could not extract table name from DATA operation: ${operation.sql}`);
            continue;
          }

          // Estimate total rows for this operation
          const totalRows = await this.estimateTableRowCount(dataSource, tableName);

          const backfillJob = new BackfillJob();
          backfillJob.tableName = tableName;
          backfillJob.migrationName = migrationId;
          backfillJob.sqlStatement = operation.sql;
          backfillJob.totalRows = totalRows;
          backfillJob.status = BackfillJobStatus.PENDING;
          backfillJob.batchSize = this.calculateOptimalBatchSize(operation);
          backfillJob.metadata = {
            phase: phase.phase,
            operationCategory: operation.category,
            estimatedTime: operation.metadata?.estimatedTime,
            requiresDowntime: operation.metadata?.requiresDowntime,
          };

          backfillJobs.push(backfillJob);
        }
      }
    }

    // Save all backfill jobs to database
    if (backfillJobs.length > 0) {
      const backfillJobRepository = dataSource.getRepository(BackfillJob);
      await backfillJobRepository.save(backfillJobs);
      console.log(`Created ${backfillJobs.length} backfill job(s) for migration ${migrationId}`);
    }

    return backfillJobs;
  }

  /**
   * Estimate row count for a table
   */
  private async estimateTableRowCount(dataSource: any, tableName: string): Promise<number> {
    try {
      const result = await dataSource.query(
        `SELECT reltuples::bigint AS estimate FROM pg_class WHERE relname = $1`,
        [tableName]
      );
      
      if (result && result[0] && result[0].estimate) {
        return Math.max(0, result[0].estimate);
      }

      // Fallback to actual count for small tables
      const countResult = await dataSource.query(
        `SELECT COUNT(*)::bigint FROM ${tableName}`
      );
      
      return parseInt(countResult[0].count, 10);
    } catch (error) {
      console.warn(`Failed to estimate row count for table ${tableName}:`, error);
      return 1000; // Default estimate
    }
  }

  /**
   * Calculate optimal batch size for a DATA operation
   */
  private calculateOptimalBatchSize(operation: any): number {
    const metadata = operation.metadata || {};
    
    // Use metadata hint if available
    if (metadata.batchSize) {
      return parseInt(metadata.batchSize, 10);
    }

    // Default based on table size hint
    switch (metadata.tableSize) {
      case 'SMALL':
        return 5000;
      case 'MEDIUM':
        return 2000;
      case 'LARGE':
        return 500;
      case 'X_LARGE':
        return 100;
      default:
        return 1000; // Default
    }
  }

  /**
   * Execute non-DATA phases synchronously during boot
   */
  public async executeFastPhases(
    plan: MigrationExecutionPlan,
    dataSource: any,
  ): Promise<{ executedPhases: string[]; skippedPhases: string[] }> {
    const executedPhases: string[] = [];
    const skippedPhases: string[] = [];

    for (const phase of plan.phases) {
      if (phase.phase === 'DATA') {
        skippedPhases.push(phase.phase);
        continue; // Skip DATA phases - they become backfill jobs
      }

      console.log(`Executing ${phase.phase} phase synchronously...`);
      
      try {
        for (const operation of phase.operations) {
          if (operation.category !== 'DATA') {
            await dataSource.query(operation.sql);
          }
        }
        
        executedPhases.push(phase.phase);
        console.log(`✅ Completed ${phase.phase} phase`);
      } catch (error) {
        console.error(`❌ Failed to execute ${phase.phase} phase:`, error);
        throw error;
      }
    }

    return { executedPhases, skippedPhases };
  }
}
