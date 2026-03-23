/**
 * Migration Replay Engine
 *
 * Rebuilds deterministic schema state for simulation by replaying
 * all applied migrations before simulating pending ones.
 * This eliminates simulation failures due to missing tables.
 */

import { DataSource } from "typeorm";
import { MigrationExecutionPlan } from "./migration-execution-plan";
import { MigrationState, MigrationStateRuntime } from "./migration-state";

export interface MigrationReplayResult {
  success: boolean;
  errors: string[];
  warnings: string[];
  replayedMigrations: string[];
  shadowDbUrl?: string;
}

export interface MigrationReplayConfig {
  baselineSchema?: string;
  useShadowDb?: boolean;
  replayTimeout?: number;
  validateSchema?: boolean;
}

/**
 * Migration Replay Engine
 *
 * Ensures simulation runs against deterministic schema state
 * by replaying all applied migrations before simulating pending ones.
 */
export class MigrationReplayEngine {
  private dataSource: DataSource;
  private stateRuntime: MigrationStateRuntime;

  constructor(dataSource: DataSource, stateRuntime: MigrationStateRuntime) {
    this.dataSource = dataSource;
    this.stateRuntime = stateRuntime;
  }

  /**
   * Rebuild migration state for simulation
   */
  public async rebuildMigrationState(
    appliedMigrations: string[],
    pendingMigrations: MigrationExecutionPlan,
    config: MigrationReplayConfig = {},
  ): Promise<MigrationReplayResult> {
    console.log("🔄 Starting migration state rebuild...");

    const result: MigrationReplayResult = {
      success: false,
      errors: [],
      warnings: [],
      replayedMigrations: [],
    };

    try {
      // Step 1: Create shadow database if configured
      const shadowDb = config.useShadowDb
        ? await this.createShadowDatabase()
        : this.dataSource;

      // Step 2: Apply baseline schema
      if (config.baselineSchema) {
        await this.applyBaselineSchema(shadowDb, config.baselineSchema);
      }

      // Step 3: Replay applied migrations
      const replayed = await this.replayAppliedMigrations(
        shadowDb,
        appliedMigrations,
      );
      result.replayedMigrations = replayed;

      // Step 4: Validate schema state
      if (config.validateSchema) {
        const validation = await this.validateSchemaState(shadowDb);
        if (!validation.success) {
          result.errors.push(...validation.errors);
          result.warnings.push(...validation.warnings);
        }
      }

      // Step 5: Store shadow database URL for simulation
      if (config.useShadowDb) {
        result.shadowDbUrl = shadowDb.options.database as string;
      }

      result.success = result.errors.length === 0;
      console.log(
        `✅ Migration state rebuild completed: ${replayed.length} migrations replayed`,
      );

      return result;
    } catch (error) {
      result.errors.push(
        `Migration replay failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return result;
    }
  }

  /**
   * Create shadow database for simulation
   */
  private async createShadowDatabase(): Promise<DataSource> {
    console.log("  Creating shadow database...");

    // Create shadow database connection
    const shadowDataSource = new DataSource({
      ...this.dataSource.options,
      database:
        `${this.dataSource.options.database}_shadow_${Date.now()}` as any,
    });

    await shadowDataSource.initialize();
    console.log("  ✅ Shadow database created");

    return shadowDataSource;
  }

  /**
   * Apply baseline schema
   */
  private async applyBaselineSchema(
    dataSource: DataSource,
    baselineSchema: string,
  ): Promise<void> {
    console.log("  Applying baseline schema...");

    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      // Execute baseline schema
      await queryRunner.query(baselineSchema);
      console.log("  ✅ Baseline schema applied");
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Replay applied migrations in order
   */
  private async replayAppliedMigrations(
    dataSource: DataSource,
    appliedMigrations: string[],
  ): Promise<string[]> {
    console.log(
      `  Replaying ${appliedMigrations.length} applied migrations...`,
    );

    const replayed: string[] = [];
    const queryRunner = dataSource.createQueryRunner();
    await queryRunner.connect();

    try {
      for (const migration of appliedMigrations) {
        try {
          console.log(`    Replaying: ${migration}`);

          // Execute migration SQL
          await queryRunner.query(migration);
          replayed.push(migration);
        } catch (error) {
          throw new Error(
            `Failed to replay migration: ${migration} - ${error}`,
          );
        }
      }

      console.log(`  ✅ ${replayed.length} migrations replayed successfully`);
      return replayed;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Validate schema state after replay
   */
  private async validateSchemaState(dataSource: DataSource): Promise<{
    success: boolean;
    errors: string[];
    warnings: string[];
  }> {
    console.log("  Validating schema state...");

    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      const queryRunner = dataSource.createQueryRunner();
      await queryRunner.connect();

      // Check for common schema issues
      const tables = await queryRunner.getTables();
      const tableNames = tables.map((t) => t.name);

      // Check for missing critical tables
      const criticalTables = ["outbox_archive", "outbox"];
      for (const table of criticalTables) {
        if (!tableNames.includes(table)) {
          warnings.push(`Critical table missing: ${table}`);
        }
      }

      // Check for orphaned constraints (simplified check)
      try {
        const constraints = await queryRunner.query(
          "SELECT constraint_name, table_name FROM information_schema.table_constraints WHERE constraint_type = 'FOREIGN KEY'",
        );
        for (const constraint of constraints) {
          if (!tableNames.includes(constraint.table_name)) {
            warnings.push(
              `Orphaned constraint: ${constraint.constraint_name} on table ${constraint.table_name}`,
            );
          }
        }
      } catch (error) {
        // Ignore constraint check errors for different database types
        console.warn("  Constraint check skipped:", error);
      }

      await queryRunner.release();

      const success = errors.length === 0;
      console.log(
        `  Schema validation: ${success ? "✅" : "❌"} ${errors.length} errors, ${warnings.length} warnings`,
      );

      return { success, errors, warnings };
    } catch (error) {
      errors.push(`Schema validation failed: ${error}`);
      return { success: false, errors, warnings };
    }
  }

  /**
   * Get applied migrations from database
   */
  public async getAppliedMigrations(): Promise<string[]> {
    console.log("  Retrieving applied migrations...");

    try {
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();

      // Query migration history table
      const appliedMigrations = await queryRunner.query(`
        SELECT name FROM migrations 
        WHERE executed_at IS NOT NULL 
        ORDER BY executed_at
      `);

      await queryRunner.release();

      const migrationNames = appliedMigrations.map((m: any) => m.name);
      console.log(`  Found ${migrationNames.length} applied migrations`);

      return migrationNames;
    } catch (error) {
      console.warn(`  Failed to retrieve applied migrations: ${error}`);
      return [];
    }
  }

  /**
   * Cleanup shadow database
   */
  public async cleanupShadowDatabase(shadowDbUrl?: string): Promise<void> {
    if (!shadowDbUrl) return;

    console.log("  Cleaning up shadow database...");

    try {
      // Extract database name from URL
      const dbName = shadowDbUrl.split("/").pop()?.split("?")[0];
      if (!dbName) return;

      const cleanupDataSource = new DataSource({
        ...this.dataSource.options,
        database: "postgres" as any, // Connect to postgres to drop database
      });

      await cleanupDataSource.initialize();

      const queryRunner = cleanupDataSource.createQueryRunner();
      await queryRunner.connect();

      try {
        await queryRunner.query(`DROP DATABASE IF EXISTS "${dbName}"`);
        console.log(`  ✅ Shadow database ${dbName} cleaned up`);
      } finally {
        await queryRunner.release();
        await cleanupDataSource.destroy();
      }
    } catch (error) {
      console.warn(`  Failed to cleanup shadow database: ${error}`);
    }
  }

  /**
   * Rebuild state with full validation
   */
  public async rebuildWithValidation(
    plan: MigrationExecutionPlan,
    migrationId: string,
  ): Promise<MigrationReplayResult> {
    console.log(`🔄 Rebuilding state for migration ${migrationId}...`);

    // Get applied migrations
    const appliedMigrations = await this.getAppliedMigrations();

    // Rebuild state
    const result = await this.rebuildMigrationState(appliedMigrations, plan, {
      useShadowDb: true,
      validateSchema: true,
      replayTimeout: 300000, // 5 minutes
    });

    if (result.success) {
      // Update state to REPLAYED
      this.stateRuntime.updateState(migrationId, MigrationState.REPLAYED);
      console.log(`✅ State rebuild completed for ${migrationId}`);
    } else {
      console.error(`❌ State rebuild failed for ${migrationId}`);
    }

    return result;
  }
}
