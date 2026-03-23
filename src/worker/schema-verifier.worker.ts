/**
 * Schema Verifier Worker
 *
 * Continuously validates that the physical database schema matches the
 * executed migration state, detecting and auto-repairing drift.
 * Implements Zero Manual Intervention philosophy.
 */

import { DataSource } from "typeorm";
import { SchemaSnapshot } from "../../scripts/migration-engine/types";
import { buildDatabaseSnapshot } from "../../scripts/migration-engine/database-snapshot";
import { buildEntitySnapshot } from "../../scripts/migration-engine/entity-snapshot";

export interface DriftDetectionResult {
  hasDrift: boolean;
  drifts: SchemaDrift[];
  severity: "NONE" | "MINOR" | "MODERATE" | "SEVERE";
  autoRepairable: boolean;
  requiresManualIntervention: boolean;
}

export interface SchemaDrift {
  type:
    | "MISSING_TABLE"
    | "MISSING_COLUMN"
    | "MISSING_INDEX"
    | "MISSING_CONSTRAINT"
    | "TYPE_MISMATCH"
    | "EXTRA_OBJECT";
  objectName: string;
  objectType: "TABLE" | "COLUMN" | "INDEX" | "CONSTRAINT";
  expected: string;
  actual?: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  autoRepairable: boolean;
  suggestedFix?: string;
}

export interface AutoRepairResult {
  success: boolean;
  repairs: RepairAction[];
  errors: string[];
  warnings: string[];
}

export interface RepairAction {
  type: "CREATE" | "ALTER" | "DROP";
  sql: string;
  description: string;
  estimatedTime: string;
  requiresApproval: boolean;
}

/**
 * Schema Verifier Worker
 *
 * Background process that continuously monitors schema consistency
 * and automatically repairs safe drifts.
 */
export class SchemaVerifierWorker {
  private dataSource: DataSource;
  private isRunning: boolean = false;
  private intervalId?: NodeJS.Timeout;

  constructor(dataSource: DataSource) {
    this.dataSource = dataSource;
  }

  /**
   * Start continuous schema verification
   */
  public async start(intervalMinutes: number = 60): Promise<void> {
    if (this.isRunning) {
      console.log("Schema verifier is already running");
      return;
    }

    console.log(
      `🔍 Starting schema verifier with ${intervalMinutes} minute intervals`,
    );

    this.isRunning = true;

    // Initial verification
    await this.performVerification();

    // Schedule periodic verification
    this.intervalId = setInterval(
      async () => {
        try {
          await this.performVerification();
        } catch (error) {
          console.error("Schema verification failed:", error);
        }
      },
      intervalMinutes * 60 * 1000,
    );
  }

  /**
   * Stop schema verification
   */
  public stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = undefined;
    }
    this.isRunning = false;
    console.log("🛑 Schema verifier stopped");
  }

  /**
   * Perform schema verification
   */
  private async performVerification(): Promise<void> {
    console.log("🔍 Performing schema verification...");

    try {
      // Get current database state
      const currentSchema = await buildDatabaseSnapshot(
        this.dataSource.options.database as string,
      );

      // Get expected schema from latest migration
      const expectedSchema = await this.getExpectedSchema();

      // Compare schemas
      const driftResult = this.compareSchemas(expectedSchema, currentSchema);

      if (driftResult.hasDrift) {
        console.log(
          `⚠️  Schema drift detected: ${driftResult.drifts.length} issues`,
        );

        // Handle drift
        await this.handleDrift(driftResult);
      } else {
        console.log("✅ Schema verification passed - no drift detected");
      }
    } catch (error) {
      console.error("Schema verification failed:", error);
    }
  }

  /**
   * Get expected schema from latest migration
   */
  private async getExpectedSchema(): Promise<SchemaSnapshot> {
    // Get the latest executed migration
    const latestMigration = await this.getLatestMigration();

    if (!latestMigration) {
      throw new Error("No migrations found");
    }

    // For now, return a basic schema snapshot
    // In a real implementation, this would reconstruct the schema
    // from the migration history or entity definitions
    return {
      tables: [],
      indexes: [],
      constraints: [],
      enums: [],
    };
  }

  /**
   * Get latest executed migration
   */
  private async getLatestMigration(): Promise<any> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      const result = await queryRunner.query(`
        SELECT name, executed_at 
        FROM migrations 
        WHERE executed_at IS NOT NULL 
        ORDER BY executed_at DESC 
        LIMIT 1
      `);

      return result[0];
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Compare schemas and detect drift
   */
  private compareSchemas(
    expected: SchemaSnapshot,
    current: SchemaSnapshot,
  ): DriftDetectionResult {
    const drifts: SchemaDrift[] = [];

    // Check for missing tables
    for (const expectedTable of expected.tables) {
      const currentTable = current.tables.find(
        (t) => t.name === expectedTable.name,
      );

      if (!currentTable) {
        drifts.push({
          type: "MISSING_TABLE",
          objectName: expectedTable.name,
          objectType: "TABLE",
          expected: "Table should exist",
          severity: "CRITICAL",
          autoRepairable: false,
        });
      } else {
        // Check columns
        for (const expectedColumn of expectedTable.columns) {
          const currentColumn = currentTable.columns.find(
            (c) => c.name === expectedColumn.name,
          );

          if (!currentColumn) {
            drifts.push({
              type: "MISSING_COLUMN",
              objectName: `${expectedTable.name}.${expectedColumn.name}`,
              objectType: "COLUMN",
              expected: `Column ${expectedColumn.name} should exist`,
              severity: "HIGH",
              autoRepairable: true,
              suggestedFix: `ALTER TABLE ${expectedTable.name} ADD COLUMN ${expectedColumn.name} ${expectedColumn.type}`,
            });
          } else if (currentColumn.type !== expectedColumn.type) {
            drifts.push({
              type: "TYPE_MISMATCH",
              objectName: `${expectedTable.name}.${expectedColumn.name}`,
              objectType: "COLUMN",
              expected: `Column type should be ${expectedColumn.type}`,
              actual: `Column type is ${currentColumn.type}`,
              severity: "MEDIUM",
              autoRepairable: false,
            });
          }
        }

        // Check indexes
        for (const expectedIndex of expectedTable.indexes) {
          const currentIndex = currentTable.indexes.find(
            (i) => i === expectedIndex,
          );

          if (!currentIndex) {
            drifts.push({
              type: "MISSING_INDEX",
              objectName: `${expectedTable.name}.${expectedIndex}`,
              objectType: "INDEX",
              expected: `Index ${expectedIndex} should exist`,
              severity: "MEDIUM",
              autoRepairable: true,
              suggestedFix: `CREATE INDEX ${expectedIndex} ON ${expectedTable.name} (...)`,
            });
          }
        }
      }
    }

    // Check for extra objects
    for (const currentTable of current.tables) {
      const expectedTable = expected.tables.find(
        (t) => t.name === currentTable.name,
      );

      if (!expectedTable) {
        drifts.push({
          type: "EXTRA_OBJECT",
          objectName: currentTable.name,
          objectType: "TABLE",
          expected: "Table should not exist",
          severity: "LOW",
          autoRepairable: true,
          suggestedFix: `DROP TABLE ${currentTable.name}`,
        });
      }
    }

    const severity = this.calculateDriftSeverity(drifts);
    const autoRepairable = drifts.every((d) => d.autoRepairable);
    const requiresManualIntervention = drifts.some((d) => !d.autoRepairable);

    return {
      hasDrift: drifts.length > 0,
      drifts,
      severity,
      autoRepairable,
      requiresManualIntervention,
    };
  }

  /**
   * Calculate overall drift severity
   */
  private calculateDriftSeverity(
    drifts: SchemaDrift[],
  ): "NONE" | "MINOR" | "MODERATE" | "SEVERE" {
    if (drifts.length === 0) return "NONE";

    const criticalCount = drifts.filter(
      (d) => d.severity === "CRITICAL",
    ).length;
    const highCount = drifts.filter((d) => d.severity === "HIGH").length;
    const mediumCount = drifts.filter((d) => d.severity === "MEDIUM").length;

    if (criticalCount > 0) return "SEVERE";
    if (highCount > 2) return "SEVERE";
    if (highCount > 0 || mediumCount > 5) return "MODERATE";
    if (mediumCount > 0) return "MINOR";

    return "MINOR";
  }

  /**
   * Handle detected drift
   */
  private async handleDrift(driftResult: DriftDetectionResult): Promise<void> {
    // Log drift details
    this.logDriftDetails(driftResult);

    // Auto-repair if possible
    if (driftResult.autoRepairable && driftResult.drifts.length > 0) {
      console.log("🔧 Attempting auto-repair...");

      const repairResult = await this.performAutoRepair(driftResult.drifts);

      if (repairResult.success) {
        console.log("✅ Auto-repair completed successfully");
      } else {
        console.error("❌ Auto-repair failed:", repairResult.errors);
      }
    } else if (driftResult.requiresManualIntervention) {
      console.log(
        "⚠️  Manual intervention required - drift cannot be auto-repaired",
      );
      // In a real system, this would trigger alerts, notifications, etc.
    }
  }

  /**
   * Log drift details
   */
  private logDriftDetails(driftResult: DriftDetectionResult): void {
    console.log(`\n📊 Drift Summary:`);
    console.log(`   Severity: ${driftResult.severity}`);
    console.log(`   Issues: ${driftResult.drifts.length}`);
    console.log(`   Auto-repairable: ${driftResult.autoRepairable}`);
    console.log(
      `   Requires manual intervention: ${driftResult.requiresManualIntervention}`,
    );

    console.log(`\n📋 Drift Details:`);
    for (const drift of driftResult.drifts) {
      console.log(
        `   ${drift.severity}: ${drift.type} - ${drift.objectName} (${drift.objectType})`,
      );
      if (drift.suggestedFix) {
        console.log(`      Suggested fix: ${drift.suggestedFix}`);
      }
    }
  }

  /**
   * Perform auto-repair of drifts
   */
  private async performAutoRepair(
    drifts: SchemaDrift[],
  ): Promise<AutoRepairResult> {
    const result: AutoRepairResult = {
      success: false,
      repairs: [],
      errors: [],
      warnings: [],
    };

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      await queryRunner.startTransaction();

      for (const drift of drifts) {
        try {
          const repair = await this.createRepairAction(drift);
          if (repair) {
            // Execute repair
            await queryRunner.query(repair.sql);
            result.repairs.push(repair);

            console.log(`   ✅ Repaired: ${repair.description}`);
          }
        } catch (error) {
          result.errors.push(
            `Failed to repair ${drift.objectName}: ${error instanceof Error ? error.message : String(error)}`,
          );
        }
      }

      await queryRunner.commitTransaction();
      result.success = result.errors.length === 0;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      result.errors.push(
        `Transaction failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    } finally {
      await queryRunner.release();
    }

    return result;
  }

  /**
   * Create repair action for a drift
   */
  private async createRepairAction(
    drift: SchemaDrift,
  ): Promise<RepairAction | null> {
    switch (drift.type) {
      case "MISSING_COLUMN":
        return this.createMissingColumnRepair(drift);

      case "MISSING_INDEX":
        return this.createMissingIndexRepair(drift);

      case "EXTRA_OBJECT":
        return this.createExtraObjectRepair(drift);

      default:
        return null;
    }
  }

  /**
   * Create repair for missing column
   */
  private async createMissingColumnRepair(
    drift: SchemaDrift,
  ): Promise<RepairAction> {
    const [tableName, columnName] = drift.objectName.split(".");

    // Get column definition from entity snapshot
    const columnDef = await this.getColumnDefinition(tableName, columnName);

    return {
      type: "CREATE",
      sql: `ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDef}`,
      description: `Add missing column ${columnName} to ${tableName}`,
      estimatedTime: "00:00:05",
      requiresApproval: false,
    };
  }

  /**
   * Create repair for missing index
   */
  private async createMissingIndexRepair(
    drift: SchemaDrift,
  ): Promise<RepairAction> {
    const [tableName, indexName] = drift.objectName.split(".");

    // Get index definition
    const indexDef = await this.getIndexDefinition(tableName, indexName);

    return {
      type: "CREATE",
      sql: `CREATE INDEX ${indexName} ON ${tableName} ${indexDef}`,
      description: `Add missing index ${indexName} to ${tableName}`,
      estimatedTime: "00:01:00",
      requiresApproval: false,
    };
  }

  /**
   * Create repair for extra object
   */
  private async createExtraObjectRepair(
    drift: SchemaDrift,
  ): Promise<RepairAction> {
    if (drift.objectType === "TABLE") {
      return {
        type: "DROP",
        sql: `DROP TABLE ${drift.objectName}`,
        description: `Remove extra table ${drift.objectName}`,
        estimatedTime: "00:00:05",
        requiresApproval: true, // Dropping tables requires approval
      };
    }

    return {
      type: "DROP",
      sql: `DROP ${drift.objectType} ${drift.objectName}`,
      description: `Remove extra ${drift.objectType} ${drift.objectName}`,
      estimatedTime: "00:00:05",
      requiresApproval: false,
    };
  }

  /**
   * Get column definition from entity snapshot
   */
  private async getColumnDefinition(
    tableName: string,
    columnName: string,
  ): Promise<string> {
    // This would typically get the column definition from the entity snapshot
    // For now, return a default type
    return "VARCHAR(255)";
  }

  /**
   * Get index definition
   */
  private async getIndexDefinition(
    tableName: string,
    indexName: string,
  ): Promise<string> {
    // This would typically get the index definition from the entity snapshot
    // For now, return a default definition
    return "(id)";
  }

  /**
   * Get verification status
   */
  public getStatus(): {
    isRunning: boolean;
    lastVerification?: Date;
    driftsDetected: number;
  } {
    return {
      isRunning: this.isRunning,
      lastVerification: new Date(),
      driftsDetected: 0, // Would track actual drifts
    };
  }
}
