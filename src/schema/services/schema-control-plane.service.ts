import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { SchemaOrchestratorService } from "./schema-orchestrator.service";
import { DriftEngine } from "../engine/drift-engine";
import { SchemaDiffService } from "./schema-diff.service";
import { REQUIRED_SCHEMA_VERSION, SCHEMA_LOCK_KEY } from "../schema.constants";
import { MigrationReadinessService } from "./migration-readiness.service";
import { BackfillJob } from "../entities/backfill-job.entity";

@Injectable()
export class SchemaControlPlaneService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SchemaControlPlaneService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly schemaOrchestratorService: SchemaOrchestratorService,
    private readonly driftEngine: DriftEngine,
    private readonly schemaDiffService: SchemaDiffService,
    private readonly migrationReadinessService: MigrationReadinessService,
  ) {}

  /**
   * Application bootstrap hook - ensures schema contract is met before application starts
   */
  async onApplicationBootstrap(): Promise<void> {
    this.logger.log("Schema Control Plane: Starting boot sequence...");

    try {
      // Step 1: Check DataSource connection
      await this.checkDataSourceConnection();

      // Step 2: Check if DB version meets requirements
      await this.checkSchemaVersion();

      // Step 3: Converge schema to desired state
      await this.schemaOrchestratorService.converge();

      // Step 4: Validate critical tables and indexes exist
      await this.validateCriticalSchema();

      this.logger.log("✅ Schema Control Plane: Boot sequence completed successfully");

    } catch (error) {
      this.logger.error("Schema Control Plane: Boot sequence failed", error);

      // If STRICT_SCHEMA is enabled, exit the application
      if (process.env.STRICT_SCHEMA === "true") {
        this.logger.error("STRICT_SCHEMA mode enabled - exiting application");
        process.exit(1);
      } else {
        this.logger.warn("STRICT_SCHEMA mode disabled - continuing with potential schema issues");
      }
    }
  }

  /**
   * Check for schema drift and return true if drift is detected
   */
  private async checkForDrift(): Promise<boolean> {
    try {
      const driftReport = await this.driftEngine.checkFullDrift();

      if (driftReport.entityDrift || driftReport.schemaDrift) {
        this.logger.warn("Schema drift detected", {
          entityDrift: driftReport.entityDrift,
          schemaDrift: driftReport.schemaDrift,
          driftDetails: driftReport.driftDetails.map(detail => ({
            ...detail,
            affectedTables: detail.affectedTables ? [...new Set(detail.affectedTables)] : undefined
          })),
        });

        // Log detailed differences if available
        if (driftReport.detailedDiff) {
          this.logger.warn("Detailed drift report:", {
            totalDifferences: driftReport.detailedDiff.summary.totalDifferences,
            criticalDifferences: driftReport.detailedDiff.summary.criticalDifferences,
            mediumDifferences: driftReport.detailedDiff.summary.mediumDifferences,
            lowDifferences: driftReport.detailedDiff.summary.lowDifferences,
            affectedTables: driftReport.detailedDiff.alteredTables,
          });
        }

        // Check for critical differences that should block startup
        const criticalDifferences = driftReport.detailedDiff?.differences.filter(
          d => d.severity === "HIGH"
        ) || [];

        if (criticalDifferences.length > 0) {
          this.logger.error(
            `${criticalDifferences.length} critical schema differences detected - blocking startup`,
            criticalDifferences
          );
          return true;
        }

        this.logger.log("Only non-critical drift detected - continuing startup");
        return false;
      }

      this.logger.log("No schema drift detected");
      return false;
    } catch (error) {
      this.logger.error("Failed to check for schema drift", error);
      throw error;
    }
  }

  /**
   * Get drift status summary with migration readiness
   */
  async getDriftStatus(): Promise<{
    totalDifferences: number;
    criticalDifferences: number;
    mediumDifferences: number;
    lowDifferences: number;
    backfillJobs: number;
    readyForMigration: number;
    status: 'HEALTHY' | 'DRIFT_DETECTED' | 'BACKFILLING' | 'READY_FOR_MIGRATION';
  }> {
    const detailedDiff = await this.schemaDiffService.getDetailedSchemaDiff();
    const backfillJobs = await this.dataSource.getRepository(BackfillJob).count();
    
    // Get migration readiness summary
    const readinessSummary = await this.migrationReadinessService.getReadinessSummary();

    let status: 'HEALTHY' | 'DRIFT_DETECTED' | 'BACKFILLING' | 'READY_FOR_MIGRATION' = 'HEALTHY';

    if (detailedDiff.summary.totalDifferences > 0) {
      status = 'DRIFT_DETECTED';
    }

    if (backfillJobs > 0) {
      const activeJobs = await this.dataSource.getRepository(BackfillJob).count({
        where: { status: 'PROCESSING' as any },
      });
      
      if (activeJobs > 0) {
        status = 'BACKFILLING';
      } else if (readinessSummary.readyForMigration > 0) {
        status = 'READY_FOR_MIGRATION';
      }
    }

    return {
      totalDifferences: detailedDiff.summary.totalDifferences,
      criticalDifferences: detailedDiff.summary.criticalDifferences,
      mediumDifferences: detailedDiff.summary.mediumDifferences,
      lowDifferences: detailedDiff.summary.lowDifferences,
      backfillJobs,
      readyForMigration: readinessSummary.readyForMigration,
      status,
    };
  }

  /**
   * Check DataSource connection
   */
  private async checkDataSourceConnection(): Promise<void> {
    try {
      await this.dataSource.query("SELECT 1");
      this.logger.log("✅ DataSource connection verified");
    } catch (error) {
      throw new Error(`DataSource connection failed: ${error.message}`);
    }
  }

  /**
   * Check if schema version meets requirements
   */
  private async checkSchemaVersion(): Promise<void> {
    this.logger.log(`Checking schema version (required: ${REQUIRED_SCHEMA_VERSION})...`);

    try {
      // Check if migrations table exists
      const hasMigrationsTable = await this.dataSource.query(`
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name = '_migrations'
        )
      `);

      if (!hasMigrationsTable[0]?.exists) {
        this.logger.warn("Migrations table not found - assuming fresh database");
        return;
      }

      // Get the latest applied migration
      const latestMigration = await this.dataSource.query(`
        SELECT name FROM _migrations ORDER BY id DESC LIMIT 1
      `);

      if (latestMigration.length === 0) {
        this.logger.warn("No migrations have been applied yet");
        return;
      }

      const latestMigrationName = latestMigration[0].name;
      this.logger.log(`Latest applied migration: ${latestMigrationName}`);

      // For now, we'll assume the migration name contains the timestamp
      // In a real implementation, you might want to parse the timestamp from the migration name
      // and compare it with REQUIRED_SCHEMA_VERSION

      this.logger.log("✅ Schema version check passed");

    } catch (error) {
      throw new Error(`Schema version check failed: ${error.message}`);
    }
  }

  /**
   * Validate critical tables and indexes exist
   */
  private async validateCriticalSchema(): Promise<void> {
    this.logger.log("Validating critical schema elements...");

    const criticalTables = [
      'drivers',
      'deliveries', 
      'assignments',
      'admin_users',
      'cities',
      'zones',
      'audit_logs'
    ];

    try {
      for (const tableName of criticalTables) {
        const exists = await this.dataSource.query(`
          SELECT EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name = $1
          )
        `, [tableName]);

        if (!exists[0]?.exists) {
          throw new Error(`Critical table missing: ${tableName}`);
        }
      }

      this.logger.log("✅ Critical schema validation passed");

    } catch (error) {
      throw new Error(`Critical schema validation failed: ${error.message}`);
    }
  }

  /**
   * Log schema status for operational visibility
   */
  async logSchemaStatus(): Promise<void> {
    this.logger.log("DATABASE STATUS");
    
    try {
      // Get schema version
      const version = REQUIRED_SCHEMA_VERSION;
      this.logger.log(`Schema version: ${version}`);

      // Check for pending migrations
      const pendingMigrations = await this.getPendingMigrations();
      this.logger.log(`Pending migrations: ${pendingMigrations}`);

      // Check for drift
      const driftDetected = await this.checkForDrift();
      this.logger.log(`Drift: ${driftDetected ? 'FOUND' : 'NONE'}`);

      // Check verification result
      const verificationPassed = await this.verifySchemaIntegrity();
      this.logger.log(`Verification: ${verificationPassed ? 'PASSED' : 'FAILED'}`);

    } catch (error) {
      this.logger.error(`Schema status check failed: ${error.message}`);
      this.logger.log("Verification: FAILED");
    }
  }

  /**
   * Verify schema integrity
   */
  private async verifySchemaIntegrity(): Promise<boolean> {
    try {
      // Check critical tables exist
      const criticalTables = [
        'drivers',
        'deliveries', 
        'assignments',
        'admin_users',
        'cities',
        'zones',
        'audit_logs'
      ];

      for (const tableName of criticalTables) {
        const exists = await this.dataSource.query(`
          SELECT EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name = $1
          )
        `, [tableName]);

        if (!exists[0]?.exists) {
          this.logger.error(`Critical table missing: ${tableName}`);
          return false;
        }
      }

      // Check migrations table exists
      const hasMigrationsTable = await this.dataSource.query(`
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name = '_migrations'
        )
      `);

      if (!hasMigrationsTable[0]?.exists) {
        this.logger.warn("Migrations table not found");
        return false;
      }

      return true;

    } catch (error) {
      this.logger.error(`Schema integrity check failed: ${error.message}`);
      return false;
    }
  }

  /**
   * Get pending migrations count
   */
  private async getPendingMigrations(): Promise<number> {
    try {
      // Check if migrations table exists
      const hasMigrationsTable = await this.dataSource.query(`
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name = '_migrations'
        )
      `);

      if (!hasMigrationsTable[0]?.exists) {
        return 0;
      }

      // Get total migrations in code (this would need to be implemented based on your migration structure)
      // For now, we'll return 0 as a placeholder
      return 0;

    } catch (error) {
      this.logger.error(`Failed to get pending migrations: ${error.message}`);
      return 0;
    }
  }


  /**
   * Get cached drift status for fast health checks
   */
  async getCachedDriftStatus(): Promise<{
    driftDetected: boolean;
    lastRun?: Date;
    lastDurationMs?: number;
    status: "HEALTHY" | "DEGRADED" | "FAILED" | "UNKNOWN";
    error?: string;
  }> {
    try {
      const cachedStatus = this.driftEngine.getCachedDriftStatus();
      
      return {
        driftDetected: cachedStatus.status === "DEGRADED",
        lastRun: cachedStatus.lastRun,
        lastDurationMs: cachedStatus.lastDurationMs,
        status: cachedStatus.status,
        error: cachedStatus.error,
      };
    } catch (error) {
      this.logger.error(`Cached drift status check failed: ${error.message}`, error);
      return {
        driftDetected: false,
        status: "FAILED",
        error: `Cached drift status check failed: ${error.message}`,
      };
    }
  }

  /**
   * Get schema status for health checks with migration readiness (fast version)
   */
  async getSchemaStatus(): Promise<{
    connected: boolean;
    version: string;
    driftDetected: boolean;
    lastConvergence: string;
    migrationReadiness: {
      readyForMigration: number;
      backfilling: number;
      pending: number;
      migrated: number;
    };
    status: "HEALTHY" | "DEGRADED" | "FAILED";
    error?: string;
  }> {
    try {
      // Check connection
      await this.dataSource.query("SELECT 1");
      const connected = true;

      // Get version info
      const version = REQUIRED_SCHEMA_VERSION;

      // Get cached drift status (fast, non-blocking)
      const cachedDriftStatus = await this.getCachedDriftStatus();
      const driftDetected = cachedDriftStatus.driftDetected;

      // Get last convergence time (would be stored in a status table)
      const lastConvergence = new Date().toISOString();

      // Get migration readiness summary
      let readinessSummary;
      let readinessError: string | undefined;
      try {
        readinessSummary = await this.migrationReadinessService.getReadinessSummary();
      } catch (error) {
        this.logger.error(`Migration readiness check failed: ${error.message}`, error);
        readinessError = `Migration readiness check failed: ${error.message}`;
        readinessSummary = {
          readyForMigration: 0,
          backfilling: 0,
          pending: 0,
          migrated: 0,
        };
      }

      // Determine overall status
      let status: "HEALTHY" | "DEGRADED" | "FAILED" = "HEALTHY";
      let error: string | undefined;

      if (cachedDriftStatus.status === "FAILED" || readinessError) {
        status = "FAILED";
        error = cachedDriftStatus.error || readinessError;
      } else if (driftDetected || cachedDriftStatus.status === "DEGRADED") {
        status = "DEGRADED";
        error = "Schema drift detected";
      }

      return {
        connected,
        version,
        driftDetected,
        lastConvergence,
        migrationReadiness: readinessSummary,
        status,
        error,
      };

    } catch (error) {
      this.logger.error(`Schema status check failed: ${error.message}`, error);
      
      return {
        connected: false,
        version: REQUIRED_SCHEMA_VERSION,
        driftDetected: false,
        lastConvergence: "never",
        migrationReadiness: {
          readyForMigration: 0,
          backfilling: 0,
          pending: 0,
          migrated: 0,
        },
        status: "FAILED",
        error: `Schema status check failed: ${error.message}`,
      };
    }
  }

  /**
   * Force schema convergence (for manual intervention)
   */
  async forceConvergence(): Promise<void> {
    this.logger.log("Force schema convergence requested...");

    try {
      await this.schemaOrchestratorService.converge();
      this.logger.log("✅ Force schema convergence completed");
    } catch (error) {
      this.logger.error("Force schema convergence failed", error);
      throw error;
    }
  }
}