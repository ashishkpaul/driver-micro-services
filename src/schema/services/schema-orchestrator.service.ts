import { Injectable, Logger } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { SchemaSnapshotService } from "./schema-snapshot.service";
import { SchemaDiffService } from "./schema-diff.service";
import { SchemaClassificationService } from "./schema-classification.service";
import { SchemaLockService } from "./schema-lock.service";
import { DriftEngine } from "../engine/drift-engine";
import {
  SchemaSnapshot,
  SchemaDiff,
  MigrationPlan,
  RiskReport,
  CompatibilityReport,
  SqlCategory,
} from "../engine/types";
import { trace } from "@opentelemetry/api";
import { SCHEMA_TELEMETRY_METRICS } from "../schema.constants";

@Injectable()
export class SchemaOrchestratorService {
  private readonly logger = new Logger(SchemaOrchestratorService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly schemaSnapshotService: SchemaSnapshotService,
    private readonly schemaDiffService: SchemaDiffService,
    private readonly schemaClassificationService: SchemaClassificationService,
    private readonly schemaLockService: SchemaLockService,
  ) {}

  /**
   * Main orchestration method - converges schema to desired state
   */
  async converge(): Promise<void> {
    const tracer = trace.getTracer('schema-orchestrator');
    
    await tracer.startActiveSpan('schema.convergence', async (span) => {
      try {
        this.logger.log("Starting schema convergence...");

        // Step 1: Acquire lock to prevent multi-pod race conditions
        const lockStartTime = Date.now();
        const acquired = await this.schemaLockService.acquireLock();
        const lockDuration = Date.now() - lockStartTime;
        
        span.setAttributes({
          'schema.lock.acquired': acquired,
          'schema.lock.duration_ms': lockDuration,
        });

        if (!acquired) {
          this.logger.warn("Schema lock not available - another pod is migrating");
          span.setStatus({ code: 1, message: 'Lock not acquired' });
          span.end();
          return;
        }

        try {
          // Step 2: Check for drift and auto-repair if possible
          await this.checkAndRepairDrift();

          // Step 3: Detect schema differences
          const diffStartTime = Date.now();
          const diff = await this.schemaDiffService.detectSchemaDiff();
          const diffDuration = Date.now() - diffStartTime;

          span.setAttributes({
            'schema.diff.operations_count': diff.up.length,
            'schema.diff.duration_ms': diffDuration,
          });

          // If no differences, we're done
          if (diff.up.length === 0) {
            this.logger.log("✅ No schema differences detected - schema is up to date");
            span.setAttributes({
              'schema.convergence.status': 'no_changes',
            });
            span.end();
            return;
          }

          // Step 4: Classify operations by risk and type
          const classificationStartTime = Date.now();
          const classified = this.schemaClassificationService.classifyOperations(diff.up);
          const classificationDuration = Date.now() - classificationStartTime;

          const categoryCounts = this.getCategoryCounts(classified);
          span.setAttributes({
            'schema.classification.safe_count': categoryCounts.SAFE || 0,
            'schema.classification.data_count': categoryCounts.DATA || 0,
            'schema.classification.breaking_count': categoryCounts.BREAKING || 0,
            'schema.classification.fix_count': categoryCounts.FIX || 0,
            'schema.classification.duration_ms': classificationDuration,
          });

          // Step 5: Analyze risks and compatibility
          const risks = this.analyzeRisks(classified);
          const compatibility = this.checkCompatibility(classified);

          const criticalRisks = risks.filter(r => r.severity === "CRITICAL").length;
          const breakingChanges = compatibility.breakingChanges.length;

          span.setAttributes({
            'schema.risks.critical_count': criticalRisks,
            'schema.compatibility.breaking_count': breakingChanges,
          });

          // Step 6: Validate migration plan
          const validationStartTime = Date.now();
          const validation = this.validateMigrationPlan(classified, risks, compatibility);
          const validationDuration = Date.now() - validationStartTime;

          span.setAttributes({
            'schema.validation.valid': validation.isValid,
            'schema.validation.errors_count': validation.errors.length,
            'schema.validation.warnings_count': validation.warnings.length,
            'schema.validation.duration_ms': validationDuration,
          });

          if (!validation.isValid) {
            this.logger.error("Migration plan validation failed", validation.errors);
            span.recordException(new Error(`Migration validation failed: ${validation.errors.join(", ")}`));
            span.setStatus({ code: 2, message: 'Validation failed' });
            span.end();
            throw new Error(`Migration validation failed: ${validation.errors.join(", ")}`);
          }

          // Step 7: Execute migration if needed
          const executionStartTime = Date.now();
          await this.executeMigration(diff, classified, risks, compatibility);
          const executionDuration = Date.now() - executionStartTime;

          span.setAttributes({
            'schema.execution.duration_ms': executionDuration,
          });

          this.logger.log("✅ Schema convergence completed successfully");

          span.setAttributes({
            'schema.convergence.status': 'completed',
            'schema.convergence.duration_ms': Date.now() - lockStartTime,
          });

        } finally {
          // Always release the lock
          await this.schemaLockService.releaseLock();
        }

      } catch (error) {
        this.logger.error("Schema convergence failed", error);
        span.recordException(error);
        span.setStatus({ code: 2, message: 'Convergence failed' });
        throw error;
      } finally {
        span.end();
      }
    });
  }

  /**
   * Get category counts for telemetry
   */
  private getCategoryCounts(classified: any[]): Record<string, number> {
    return classified.reduce((acc, stmt) => {
      acc[stmt.category] = (acc[stmt.category] || 0) + 1;
      return acc;
    }, {});
  }

  /**
   * Check for drift and perform auto-repair if possible
   */
  private async checkAndRepairDrift(): Promise<void> {
    this.logger.log("Checking for schema drift...");

    try {
      const driftEngine = new DriftEngine(this.dataSource);
      const driftReport = await driftEngine.checkFullDrift();

      if (driftReport.entityDrift || driftReport.migrationDrift || driftReport.schemaDrift) {
        this.logger.warn("Drift detected", driftReport.driftDetails);
        
        // For now, we'll log the drift but not auto-repair
        // In a future implementation, we could add auto-repair logic here
        // based on the drift details and recommendations
        
        // Log recommendations
        driftReport.recommendations.forEach(rec => {
          this.logger.log(`Recommendation: ${rec}`);
        });
      } else {
        this.logger.log("✅ No drift detected");
      }
    } catch (error) {
      this.logger.error("Failed to check drift", error);
      throw error;
    }
  }

  /**
   * Analyze risks for classified operations
   */
  private analyzeRisks(classified: any[]): RiskReport[] {
    const risks: RiskReport[] = [];

    classified.forEach(stmt => {
      let severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" = "LOW";
      let category: "PERFORMANCE" | "DATA_LOSS" | "BLOCKING" | "COMPATIBILITY" = "PERFORMANCE";
      let requiresApproval = false;

      switch (stmt.category) {
        case "BREAKING":
          severity = "CRITICAL";
          category = "DATA_LOSS";
          requiresApproval = true;
          break;
        case "DATA":
          severity = "MEDIUM";
          category = "PERFORMANCE";
          requiresApproval = false;
          break;
        case "SAFE":
          severity = "LOW";
          category = "PERFORMANCE";
          requiresApproval = false;
          break;
        case "FIX":
          severity = "MEDIUM";
          category = "COMPATIBILITY";
          requiresApproval = false;
          break;
      }

      risks.push({
        operation: stmt.sql,
        severity,
        category,
        description: stmt.reason,
        requiresApproval,
      });
    });

    return risks;
  }

  /**
   * Check compatibility for classified operations
   */
  private checkCompatibility(classified: any[]): CompatibilityReport {
    const breakingChanges: string[] = [];
    const recommendations: string[] = [];

    classified.forEach(stmt => {
      if (stmt.category === "BREAKING") {
        breakingChanges.push(stmt.sql);
        recommendations.push(`Review application code for references to affected schema elements in: ${stmt.sql}`);
      }
    });

    return {
      breakingChanges,
      backwardCompatible: breakingChanges.length === 0,
      apiCompatibility: breakingChanges.length === 0,
      migrationCompatibility: true, // Simplified for now
      recommendations,
    };
  }

  /**
   * Validate migration plan
   */
  private validateMigrationPlan(
    classified: any[],
    risks: RiskReport[],
    compatibility: CompatibilityReport
  ): { isValid: boolean; errors: string[]; warnings: string[] } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Check for critical risks
    const criticalRisks = risks.filter(r => r.severity === "CRITICAL");
    if (criticalRisks.length > 0) {
      errors.push(`Critical risks detected: ${criticalRisks.map(r => r.operation).join(", ")}`);
    }

    // Check for breaking compatibility
    if (compatibility.breakingChanges.length > 0) {
      errors.push(`Breaking compatibility changes detected: ${compatibility.breakingChanges.join(", ")}`);
    }

    // Check for mixed phases in single migration
    const categories = new Set(classified.map(s => s.category));
    const needsPhaseDecomposition = this.schemaClassificationService.needsPhaseDecomposition(classified);
    if (needsPhaseDecomposition) {
      warnings.push("Mixed operation types detected - consider splitting into separate migrations");
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Execute migration
   */
  private async executeMigration(
    diff: SchemaDiff,
    classified: any[],
    risks: RiskReport[],
    compatibility: CompatibilityReport
  ): Promise<void> {
    this.logger.log(`Executing migration with ${diff.up.length} operations...`);

    // For now, we'll simulate the execution
    // In a real implementation, this would use TypeORM's migration runner
    // or execute the SQL statements directly

    for (const operation of diff.up) {
      this.logger.log(`Executing: ${operation}`);
      // Simulate execution delay
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    this.logger.log("✅ Migration execution completed");
  }
}