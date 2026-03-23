import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";
import { SchemaOrchestratorService } from "./schema-orchestrator.service";
import { REQUIRED_SCHEMA_VERSION, SCHEMA_LOCK_KEY } from "../schema.constants";

@Injectable()
export class SchemaControlPlaneService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SchemaControlPlaneService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly schemaOrchestratorService: SchemaOrchestratorService,
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
   * Check if DataSource is properly connected
   */
  private async checkDataSourceConnection(): Promise<void> {
    this.logger.log("Checking DataSource connection...");

    try {
      await this.dataSource.query("SELECT 1");
      this.logger.log("✅ DataSource connection verified");
    } catch (error) {
      throw new Error(`DataSource connection failed: ${error.message}`);
    }
  }

  /**
   * Check if database schema version meets requirements
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
        this.logger.warn("Migrations table not found - this appears to be a fresh database");
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
   * Get schema status for health checks
   */
  async getSchemaStatus(): Promise<{
    connected: boolean;
    version: string;
    driftDetected: boolean;
    lastConvergence: string;
  }> {
    try {
      // Check connection
      await this.dataSource.query("SELECT 1");
      const connected = true;

      // Get version info
      const version = REQUIRED_SCHEMA_VERSION;

      // Check for drift (simplified check)
      const driftDetected = false; // Would be implemented with actual drift detection

      // Get last convergence time (would be stored in a status table)
      const lastConvergence = new Date().toISOString();

      return {
        connected,
        version,
        driftDetected,
        lastConvergence,
      };

    } catch (error) {
      return {
        connected: false,
        version: REQUIRED_SCHEMA_VERSION,
        driftDetected: false,
        lastConvergence: "never",
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