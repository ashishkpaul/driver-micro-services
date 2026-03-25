/**
 * Drift Engine
 *
 * Unified drift detection and management.
 * Eliminates the contradiction between db:drift and db:zero-drift.
 */

import { Injectable, Logger } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { Cron } from "@nestjs/schedule";
import { DataSource } from "typeorm";
import { SchemaSnapshot } from "./types";
import { SchemaDiffService, DetailedSchemaDiff, SchemaDifference } from "../services/schema-diff.service";
import { DriftCacheService } from "../services/drift-cache.service";

export interface DriftReport {
  entityDrift: boolean;
  migrationDrift: boolean;
  schemaDrift: boolean;
  driftDetails: DriftDetail[];
  recommendations: string[];
  detailedDiff?: DetailedSchemaDiff;
}

export interface DriftDetail {
  type: "ENTITY" | "MIGRATION" | "SCHEMA";
  description: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  affectedTables?: string[];
  suggestedAction: string;
  differences?: SchemaDifference[];
}

/**
 * Drift Engine
 *
 * Provides unified drift detection across entities, migrations, and schema
 */
@Injectable()
export class DriftEngine {
  private readonly logger = new Logger(DriftEngine.name);
  private running = false;

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly schemaDiffService: SchemaDiffService,
    private readonly driftCacheService: DriftCacheService,
  ) {}

  private ensureReady() {
    if (!this.dataSource) {
      throw new Error("DriftEngine DataSource not injected");
    }

    if (!this.dataSource.isInitialized) {
      throw new Error("DataSource not initialized");
    }
  }

  /**
   * Check full drift status with detailed explanations
   */
  public async checkFullDrift(): Promise<DriftReport> {
    console.log("🔍 Checking full drift status...");

    const entityDrift = await this.checkEntityDrift();
    const migrationDrift = await this.checkMigrationDrift();
    const schemaDrift = await this.checkSchemaDrift();

    const driftDetails: DriftDetail[] = [];
    const recommendations: string[] = [];

    // Get detailed schema differences for better explanations
    let detailedDiff: DetailedSchemaDiff | undefined;
    
    try {
      detailedDiff = await this.schemaDiffService.getDetailedSchemaDiff();
    } catch (error) {
      console.warn("Failed to get detailed schema diff:", error);
    }

    if (entityDrift) {
      const entityDifferences = detailedDiff?.differences.filter(d => d.table) || [];
      if (entityDifferences.length > 0) {
        driftDetails.push({
          type: "ENTITY",
          description: "Entity definitions differ from database schema",
          severity: "HIGH",
          suggestedAction: "Run schema synchronization or generate new migrations",
          affectedTables: entityDifferences.map(d => d.table),
          differences: entityDifferences,
        });
        recommendations.push(
          "Review entity changes and generate appropriate migrations",
        );
      } else {
        // If entityDrift is true but no differences, it might be a false positive
        this.logger.warn("Entity drift detected but no differences found - possible false positive");
      }
    }

    if (migrationDrift) {
      driftDetails.push({
        type: "MIGRATION",
        description: "Pending migrations detected",
        severity: "CRITICAL",
        suggestedAction: "Run pending migrations before deployment",
      });
      recommendations.push(
        "Execute pending migrations in development environment",
      );
    }

    if (schemaDrift) {
      const schemaDifferences = detailedDiff?.differences.filter(d => d.table) || [];
      if (schemaDifferences.length > 0) {
        driftDetails.push({
          type: "SCHEMA",
          description: "Database schema differs from expected state",
          severity: "HIGH",
          suggestedAction: "Compare schema snapshots and resolve discrepancies",
          affectedTables: schemaDifferences.map(d => d.table),
          differences: schemaDifferences,
        });
        recommendations.push(
          "Investigate manual schema changes and update entity definitions",
        );
      } else {
        // If schemaDrift is true but no differences, it might be a false positive
        this.logger.warn("Schema drift detected but no differences found - possible false positive");
      }
    }

    return {
      entityDrift,
      migrationDrift,
      schemaDrift,
      driftDetails,
      recommendations,
      detailedDiff,
    };
  }

  /**
   * Check entity drift (TypeORM entities vs database)
   */
  public async checkEntityDrift(): Promise<boolean> {
    this.ensureReady();
    console.log("  Checking entity drift...");

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      // Check if schema synchronization is needed by comparing entity metadata with database
      const entityMetadatas = this.dataSource.entityMetadatas;
      const currentSchema = await this.buildDatabaseSnapshot();
      const expectedSchema = await this.buildEntitySnapshot();

      // If schemas match, no entity drift
      const hasSchemaChanges = this.compareSchemas(currentSchema, expectedSchema);
      
      return hasSchemaChanges;
    } catch (error) {
      console.warn("  Entity drift check failed:", error);
      return false;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Check migration drift (pending migrations)
   */
  public async checkMigrationDrift(): Promise<boolean> {
    this.ensureReady();
    console.log("  Checking migration drift...");

    try {
      const pendingMigrations = await this.dataSource.showMigrations();
      return pendingMigrations;
    } catch (error) {
      console.warn("  Migration drift check failed:", error);
      return false;
    }
  }

  /**
   * Check schema drift (database vs expected schema)
   */
  public async checkSchemaDrift(): Promise<boolean> {
    this.ensureReady();
    console.log("  Checking schema drift...");

    try {
      // Compare current schema with expected schema
      const currentSchema = await this.buildDatabaseSnapshot();
      const expectedSchema = await this.buildEntitySnapshot();

      return this.compareSchemas(currentSchema, expectedSchema);
    } catch (error) {
      console.warn("  Schema drift check failed:", error);
      return false;
    }
  }

  /**
   * Build database schema snapshot
   */
  private async buildDatabaseSnapshot(): Promise<SchemaSnapshot> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      const tables = await queryRunner.getTables();

      return {
        tables: tables.map((table) => ({
          name: table.name,
          columns: table.columns.map((col) => ({
            name: col.name,
            type: col.type,
            nullable: col.isNullable,
            default: col.default,
            primaryKey: col.isPrimary,
            unique: false, // Simplified for compatibility
          })),
          indexes: [],
          constraints: [],
        })),
        indexes: [],
        constraints: [],
        enums: [],
      };
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Build entity schema snapshot
   */
  private async buildEntitySnapshot(): Promise<SchemaSnapshot> {
    const entityMetadatas = this.dataSource.entityMetadatas;

    return {
      tables: entityMetadatas.map((metadata) => ({
        name: metadata.tableName,
        columns: metadata.columns.map((col) => ({
          name: col.databaseName,
          type: col.type as string,
          nullable: col.isNullable,
          default: col.default as string,
          primaryKey: col.isPrimary,
          unique: false, // Simplified for compatibility
        })),
        indexes: [],
        constraints: [],
      })),
      indexes: [],
      constraints: [],
      enums: [],
    };
  }

  /**
   * Compare schemas for drift detection
   */
  private compareSchemas(
    current: SchemaSnapshot,
    expected: SchemaSnapshot,
  ): boolean {
    // Compare table structure
    const currentTables = new Set(current.tables.map((t) => t.name));
    const expectedTables = new Set(expected.tables.map((t) => t.name));

    // Check for missing tables
    for (const table of expectedTables) {
      if (!currentTables.has(table)) {
        return true;
      }
    }

    // Check for extra tables
    for (const table of currentTables) {
      if (!expectedTables.has(table)) {
        return true;
      }
    }

    // Compare column definitions
    for (const expectedTable of expected.tables) {
      const currentTable = current.tables.find(
        (t) => t.name === expectedTable.name,
      );
      if (!currentTable) continue;

      const currentColumns = new Map(
        currentTable.columns.map((c) => [c.name, c]),
      );
      const expectedColumns = new Map(
        expectedTable.columns.map((c) => [c.name, c]),
      );

      // Check for missing columns
      for (const [name, col] of expectedColumns) {
        const currentCol = currentColumns.get(name);
        if (!currentCol) return true;

        // Check column properties
        if (
          currentCol.type !== col.type ||
          currentCol.nullable !== col.nullable ||
          currentCol.primaryKey !== col.primaryKey
        ) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Generate drift resolution plan
   */
  public async generateResolutionPlan(driftReport: DriftReport): Promise<{
    actions: DriftAction[];
    estimatedTime: string;
    riskLevel: "LOW" | "MEDIUM" | "HIGH";
  }> {
    const actions: DriftAction[] = [];
    let totalSeconds = 0;

    if (driftReport.entityDrift) {
      actions.push({
        type: "GENERATE_MIGRATIONS",
        description: "Generate migrations for entity changes",
        estimatedTime: "5m",
        riskLevel: "MEDIUM",
        requiresApproval: true,
      });
      totalSeconds += 300;
    }

    if (driftReport.migrationDrift) {
      actions.push({
        type: "EXECUTE_MIGRATIONS",
        description: "Execute pending migrations",
        estimatedTime: "10m",
        riskLevel: "HIGH",
        requiresApproval: true,
      });
      totalSeconds += 600;
    }

    if (driftReport.schemaDrift) {
      actions.push({
        type: "RESOLVE_SCHEMA_CONFLICTS",
        description: "Resolve schema conflicts",
        estimatedTime: "15m",
        riskLevel: "HIGH",
        requiresApproval: true,
      });
      totalSeconds += 900;
    }

    // Determine overall risk level
    const riskLevel =
      actions.length === 0
        ? "LOW"
        : actions.some((a) => a.riskLevel === "HIGH")
          ? "HIGH"
          : "MEDIUM";

    return {
      actions,
      estimatedTime: this.formatTime(totalSeconds),
      riskLevel,
    };
  }

  /**
   * Format time in human-readable format
   */
  private formatTime(seconds: number): string {
    if (seconds < 60) {
      return `${seconds}s`;
    } else if (seconds < 3600) {
      return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
    } else {
      return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
    }
  }

  /**
   * Validate drift resolution
   */
  public async validateResolution(): Promise<boolean> {
    console.log("✅ Validating drift resolution...");

    const driftReport = await this.checkFullDrift();
    return (
      !driftReport.entityDrift &&
      !driftReport.migrationDrift &&
      !driftReport.schemaDrift
    );
  }

  /**
   * Background drift analysis - runs every 120 seconds
   */
  @Cron("*/120 * * * * *")
  async runBackgroundDriftAnalysis(): Promise<void> {
    // Prevent overlapping runs
    if (this.running) {
      this.logger.debug("Background drift analysis already running, skipping...");
      return;
    }

    this.running = true;
    const startTime = Date.now();

    try {
      this.logger.log("🔄 Running background drift analysis...");

      const driftReport = await this.checkFullDrift();
      const durationMs = Date.now() - startTime;

      // Cache the result
      await this.driftCacheService.update(driftReport, durationMs);

      this.logger.log(`✅ Background drift analysis completed (${durationMs}ms)`);
    } catch (error) {
      const durationMs = Date.now() - startTime;
      this.logger.error(`❌ Background drift analysis failed after ${durationMs}ms`, error);
      
      // Mark as failed in cache
      this.driftCacheService.markFailed(error as Error);
    } finally {
      this.running = false;
    }
  }

  /**
   * Get cached drift status for health checks
   */
  public getCachedDriftStatus(): {
    report?: DriftReport;
    lastRun?: Date;
    lastDurationMs?: number;
    status: "HEALTHY" | "DEGRADED" | "FAILED" | "UNKNOWN";
    error?: string;
  } {
    return this.driftCacheService.get();
  }
}

export interface DriftAction {
  type:
    | "GENERATE_MIGRATIONS"
    | "EXECUTE_MIGRATIONS"
    | "RESOLVE_SCHEMA_CONFLICTS";
  description: string;
  estimatedTime: string;
  riskLevel: "LOW" | "MEDIUM" | "HIGH";
  requiresApproval: boolean;
}
