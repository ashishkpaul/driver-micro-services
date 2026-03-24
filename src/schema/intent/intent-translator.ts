/**
 * Intent Translator
 *
 * Translates declarative schema intents into concrete Expand-Migrate-Contract
 * migration phases with all necessary SQL operations and backfill logic.
 */

import {
  SchemaIntent,
  IntentTranslation,
  IntentPhase,
  IntentOperation,
} from "./schema-intent";

/**
 * Intent Translator
 *
 * Converts high-level schema evolution intents into detailed migration plans
 * following the Expand-Migrate-Contract pattern.
 */
export class IntentTranslator {
  /**
   * Translate an intent into a migration plan
   */
  public translate(intent: SchemaIntent): IntentTranslation {
    console.log(`🔄 Translating intent: ${intent.type}`);

    const translation: IntentTranslation = {
      phases: [],
      estimatedTime: "00:00:00",
      requiredApprovals: [],
      rollbackPlan: [],
    };

    switch (intent.type) {
      case "RENAME_COLUMN":
        translation.phases = this.translateRenameColumn(intent);
        break;
      case "CHANGE_COLUMN_TYPE":
        translation.phases = this.translateChangeColumnType(intent);
        break;
      case "ADD_COLUMN":
        translation.phases = this.translateAddColumn(intent);
        break;
      case "DROP_COLUMN":
        translation.phases = this.translateDropColumn(intent);
        break;
      case "ADD_INDEX":
        translation.phases = this.translateAddIndex(intent);
        break;
      case "DROP_INDEX":
        translation.phases = this.translateDropIndex(intent);
        break;
      case "ADD_CONSTRAINT":
        translation.phases = this.translateAddConstraint(intent);
        break;
      case "DROP_CONSTRAINT":
        translation.phases = this.translateDropConstraint(intent);
        break;
      case "RENAME_TABLE":
        translation.phases = this.translateRenameTable(intent);
        break;
      case "SPLIT_TABLE":
        translation.phases = this.translateSplitTable(intent);
        break;
      case "MERGE_TABLES":
        translation.phases = this.translateMergeTables(intent);
        break;
    }

    // Calculate estimated time
    translation.estimatedTime = this.calculateEstimatedTime(translation.phases);

    // Determine required approvals
    translation.requiredApprovals = this.determineApprovals(
      intent,
      translation.phases,
    );

    // Generate rollback plan
    translation.rollbackPlan = this.generateRollbackPlan(translation.phases);

    console.log(
      `✅ Intent translation complete: ${translation.phases.length} phases`,
    );

    return translation;
  }

  /**
   * Translate RENAME_COLUMN intent
   */
  private translateRenameColumn(intent: SchemaIntent): IntentPhase[] {
    const table = intent.payload.table;
    const oldColumn = intent.payload.column!;
    const newColumn = intent.payload.newColumn!;
    const options = intent.payload.options;

    const phases: IntentPhase[] = [];

    // Phase 1: EXPAND - Add new column
    phases.push({
      phase: "EXPAND",
      operations: [
        {
          type: "SQL",
          sql: `ALTER TABLE ${table} ADD COLUMN ${newColumn} VARCHAR(255)`,
          description: `Add new column ${newColumn} to ${table}`,
          estimatedTime: "00:00:05",
        },
      ],
      dependencies: [],
      estimatedDuration: "00:00:10",
      rollbackOperations: [
        {
          type: "SQL",
          sql: `ALTER TABLE ${table} DROP COLUMN ${newColumn}`,
          description: `Remove new column ${newColumn}`,
        },
      ],
    });

    // Phase 2: DATA - Backfill data
    phases.push({
      phase: "DATA",
      operations: [
        {
          type: "BACKFILL",
          sql: `UPDATE ${table} SET ${newColumn} = ${oldColumn}`,
          description: `Copy data from ${oldColumn} to ${newColumn}`,
          estimatedTime: options?.estimatedRows
            ? `${Math.ceil(options.estimatedRows / 10000)} minutes`
            : "00:05:00",
          requiresApproval: options?.downtimeRequired || false,
        },
      ],
      dependencies: ["EXPAND"],
      estimatedDuration: options?.estimatedRows
        ? `${Math.ceil(options.estimatedRows / 10000)} minutes`
        : "00:05:00",
      rollbackOperations: [
        {
          type: "SQL",
          sql: `UPDATE ${table} SET ${newColumn} = NULL`,
          description: `Clear data from new column`,
        },
      ],
    });

    // Phase 3: CONTRACT - Drop old column
    phases.push({
      phase: "CONTRACT",
      operations: [
        {
          type: "SQL",
          sql: `ALTER TABLE ${table} DROP COLUMN ${oldColumn}`,
          description: `Remove old column ${oldColumn}`,
          estimatedTime: "00:00:05",
          requiresApproval: true,
        },
      ],
      dependencies: ["DATA"],
      estimatedDuration: "00:00:10",
      rollbackOperations: [
        {
          type: "SQL",
          sql: `ALTER TABLE ${table} ADD COLUMN ${oldColumn} VARCHAR(255)`,
          description: `Restore old column ${oldColumn}`,
        },
        {
          type: "BACKFILL",
          sql: `UPDATE ${table} SET ${oldColumn} = ${newColumn}`,
          description: `Copy data back to old column`,
        },
      ],
    });

    return phases;
  }

  /**
   * Translate CHANGE_COLUMN_TYPE intent
   */
  private translateChangeColumnType(intent: SchemaIntent): IntentPhase[] {
    const table = intent.payload.table;
    const column = intent.payload.column!;
    const newType = intent.payload.newType!;
    const options = intent.payload.options;

    const phases: IntentPhase[] = [];

    // Phase 1: EXPAND - Add temporary column
    phases.push({
      phase: "EXPAND",
      operations: [
        {
          type: "SQL",
          sql: `ALTER TABLE ${table} ADD COLUMN ${column}_temp ${newType}`,
          description: `Add temporary column ${column}_temp with new type`,
          estimatedTime: "00:00:05",
        },
      ],
      dependencies: [],
      estimatedDuration: "00:00:10",
      rollbackOperations: [
        {
          type: "SQL",
          sql: `ALTER TABLE ${table} DROP COLUMN ${column}_temp`,
          description: `Remove temporary column`,
        },
      ],
    });

    // Phase 2: DATA - Convert data
    phases.push({
      phase: "DATA",
      operations: [
        {
          type: "BACKFILL",
          sql: `UPDATE ${table} SET ${column}_temp = CAST(${column} AS ${newType})`,
          description: `Convert data from ${column} to ${column}_temp`,
          estimatedTime: options?.estimatedRows
            ? `${Math.ceil(options.estimatedRows / 5000)} minutes`
            : "00:10:00",
          requiresApproval: options?.downtimeRequired || false,
        },
      ],
      dependencies: ["EXPAND"],
      estimatedDuration: options?.estimatedRows
        ? `${Math.ceil(options.estimatedRows / 5000)} minutes`
        : "00:10:00",
      rollbackOperations: [
        {
          type: "SQL",
          sql: `UPDATE ${table} SET ${column}_temp = NULL`,
          description: `Clear temporary column data`,
        },
      ],
    });

    // Phase 3: CONTRACT - Replace original column
    phases.push({
      phase: "CONTRACT",
      operations: [
        {
          type: "SQL",
          sql: `ALTER TABLE ${table} DROP COLUMN ${column}`,
          description: `Remove original column ${column}`,
          estimatedTime: "00:00:05",
          requiresApproval: true,
        },
        {
          type: "SQL",
          sql: `ALTER TABLE ${table} RENAME COLUMN ${column}_temp TO ${column}`,
          description: `Rename temporary column to original name`,
          estimatedTime: "00:00:05",
        },
      ],
      dependencies: ["DATA"],
      estimatedDuration: "00:00:15",
      rollbackOperations: [
        {
          type: "SQL",
          sql: `ALTER TABLE ${table} ADD COLUMN ${column} VARCHAR(255)`,
          description: `Restore original column`,
        },
        {
          type: "BACKFILL",
          sql: `UPDATE ${table} SET ${column} = ${column}_temp`,
          description: `Copy data back to original column`,
        },
      ],
    });

    return phases;
  }

  /**
   * Translate ADD_COLUMN intent
   */
  private translateAddColumn(intent: SchemaIntent): IntentPhase[] {
    const table = intent.payload.table;
    const column = intent.payload.column!;
    const newType = intent.payload.newType!;
    const options = intent.payload.options;

    const phases: IntentPhase[] = [];

    // Phase 1: EXPAND - Add column
    phases.push({
      phase: "EXPAND",
      operations: [
        {
          type: "SQL",
          sql: `ALTER TABLE ${table} ADD COLUMN ${column} ${newType}`,
          description: `Add new column ${column} to ${table}`,
          estimatedTime: "00:00:05",
        },
      ],
      dependencies: [],
      estimatedDuration: "00:00:10",
      rollbackOperations: [
        {
          type: "SQL",
          sql: `ALTER TABLE ${table} DROP COLUMN ${column}`,
          description: `Remove new column ${column}`,
        },
      ],
    });

    // If default value or backfill needed
    if (options?.backfillStrategy) {
      phases.push({
        phase: "DATA",
        operations: [
          {
            type: "BACKFILL",
            sql: `UPDATE ${table} SET ${column} = 'default_value' WHERE ${column} IS NULL`,
            description: `Backfill default values for ${column}`,
            estimatedTime: options.estimatedRows
              ? `${Math.ceil(options.estimatedRows / 10000)} minutes`
              : "00:02:00",
          },
        ],
        dependencies: ["EXPAND"],
        estimatedDuration: options.estimatedRows
          ? `${Math.ceil(options.estimatedRows / 10000)} minutes`
          : "00:02:00",
        rollbackOperations: [
          {
            type: "SQL",
            sql: `UPDATE ${table} SET ${column} = NULL`,
            description: `Clear backfilled values`,
          },
        ],
      });
    }

    return phases;
  }

  /**
   * Translate DROP_COLUMN intent
   */
  private translateDropColumn(intent: SchemaIntent): IntentPhase[] {
    const table = intent.payload.table;
    const column = intent.payload.column!;

    const phases: IntentPhase[] = [];

    // Phase 1: EXPAND - Validate no references
    phases.push({
      phase: "EXPAND",
      operations: [
        {
          type: "VALIDATION",
          sql: `SELECT COUNT(*) FROM information_schema.key_column_usage WHERE column_name = '${column}' AND table_name = '${table}'`,
          description: `Check for foreign key references to ${column}`,
          estimatedTime: "00:00:05",
        },
      ],
      dependencies: [],
      estimatedDuration: "00:00:10",
      rollbackOperations: [],
    });

    // Phase 2: CONTRACT - Drop column
    phases.push({
      phase: "CONTRACT",
      operations: [
        {
          type: "SQL",
          sql: `ALTER TABLE ${table} DROP COLUMN ${column}`,
          description: `Remove column ${column} from ${table}`,
          estimatedTime: "00:00:05",
          requiresApproval: true,
        },
      ],
      dependencies: ["EXPAND"],
      estimatedDuration: "00:00:10",
      rollbackOperations: [
        {
          type: "SQL",
          sql: `ALTER TABLE ${table} ADD COLUMN ${column} VARCHAR(255)`,
          description: `Restore dropped column`,
        },
      ],
    });

    return phases;
  }

  /**
   * Translate ADD_INDEX intent
   */
  private translateAddIndex(intent: SchemaIntent): IntentPhase[] {
    const table = intent.payload.table;
    const indexName = intent.payload.indexName!;
    const columns = intent.payload.columns!;
    const options = intent.payload.options;

    const phases: IntentPhase[] = [];

    // Phase 1: EXPAND - Add index
    phases.push({
      phase: "EXPAND",
      operations: [
        {
          type: "SQL",
          sql: `CREATE INDEX ${indexName} ON ${table} (${columns.join(", ")})`,
          description: `Create index ${indexName} on ${table}`,
          estimatedTime: options?.estimatedRows
            ? `${Math.ceil(options.estimatedRows / 100000)} minutes`
            : "00:01:00",
          requiresApproval: options?.downtimeRequired || false,
        },
      ],
      dependencies: [],
      estimatedDuration: options?.estimatedRows
        ? `${Math.ceil(options.estimatedRows / 100000)} minutes`
        : "00:01:00",
      rollbackOperations: [
        {
          type: "SQL",
          sql: `DROP INDEX ${indexName}`,
          description: `Remove index ${indexName}`,
        },
      ],
    });

    return phases;
  }

  /**
   * Translate DROP_INDEX intent
   */
  private translateDropIndex(intent: SchemaIntent): IntentPhase[] {
    const table = intent.payload.table;
    const indexName = intent.payload.indexName!;

    const phases: IntentPhase[] = [];

    // Phase 1: EXPAND - Validate index usage
    phases.push({
      phase: "EXPAND",
      operations: [
        {
          type: "VALIDATION",
          sql: `SELECT * FROM pg_stat_user_indexes WHERE indexrelname = '${indexName}'`,
          description: `Check index usage statistics`,
          estimatedTime: "00:00:05",
        },
      ],
      dependencies: [],
      estimatedDuration: "00:00:10",
      rollbackOperations: [],
    });

    // Phase 2: CONTRACT - Drop index
    phases.push({
      phase: "CONTRACT",
      operations: [
        {
          type: "SQL",
          sql: `DROP INDEX ${indexName}`,
          description: `Remove index ${indexName}`,
          estimatedTime: "00:00:05",
        },
      ],
      dependencies: ["EXPAND"],
      estimatedDuration: "00:00:10",
      rollbackOperations: [
        {
          type: "SQL",
          sql: `CREATE INDEX ${indexName} ON ${table} (${intent.payload.columns?.join(", ") || "*"})`,
          description: `Restore dropped index`,
        },
      ],
    });

    return phases;
  }

  /**
   * Translate ADD_CONSTRAINT intent
   */
  private translateAddConstraint(intent: SchemaIntent): IntentPhase[] {
    const table = intent.payload.table;
    const constraintName = intent.payload.constraintName!;
    const constraintType = intent.payload.constraintType!;
    const columns = intent.payload.columns!;
    const constraintDefinition = intent.payload.constraintDefinition;

    const phases: IntentPhase[] = [];

    // Phase 1: EXPAND - Validate constraint
    phases.push({
      phase: "EXPAND",
      operations: [
        {
          type: "VALIDATION",
          sql: `SELECT COUNT(*) FROM ${table} WHERE ${constraintDefinition || columns.join(" IS NOT NULL AND ")} IS NOT NULL`,
          description: `Validate constraint can be applied to existing data`,
          estimatedTime: "00:00:10",
        },
      ],
      dependencies: [],
      estimatedDuration: "00:00:15",
      rollbackOperations: [],
    });

    // Phase 2: CONTRACT - Add constraint
    phases.push({
      phase: "CONTRACT",
      operations: [
        {
          type: "SQL",
          sql: `ALTER TABLE ${table} ADD CONSTRAINT ${constraintName} ${constraintType} (${columns.join(", ")})`,
          description: `Add ${constraintType} constraint ${constraintName}`,
          estimatedTime: "00:00:05",
        },
      ],
      dependencies: ["EXPAND"],
      estimatedDuration: "00:00:10",
      rollbackOperations: [
        {
          type: "SQL",
          sql: `ALTER TABLE ${table} DROP CONSTRAINT ${constraintName}`,
          description: `Remove constraint ${constraintName}`,
        },
      ],
    });

    return phases;
  }

  /**
   * Translate DROP_CONSTRAINT intent
   */
  private translateDropConstraint(intent: SchemaIntent): IntentPhase[] {
    const table = intent.payload.table;
    const constraintName = intent.payload.constraintName!;

    const phases: IntentPhase[] = [];

    // Phase 1: EXPAND - Validate constraint usage
    phases.push({
      phase: "EXPAND",
      operations: [
        {
          type: "VALIDATION",
          sql: `SELECT * FROM information_schema.table_constraints WHERE constraint_name = '${constraintName}' AND table_name = '${table}'`,
          description: `Check constraint definition and dependencies`,
          estimatedTime: "00:00:05",
        },
      ],
      dependencies: [],
      estimatedDuration: "00:00:10",
      rollbackOperations: [],
    });

    // Phase 2: CONTRACT - Drop constraint
    phases.push({
      phase: "CONTRACT",
      operations: [
        {
          type: "SQL",
          sql: `ALTER TABLE ${table} DROP CONSTRAINT ${constraintName}`,
          description: `Remove constraint ${constraintName}`,
          estimatedTime: "00:00:05",
        },
      ],
      dependencies: ["EXPAND"],
      estimatedDuration: "00:00:10",
      rollbackOperations: [
        {
          type: "SQL",
          sql: `ALTER TABLE ${table} ADD CONSTRAINT ${constraintName} CHECK (true)`,
          description: `Restore constraint ${constraintName}`,
        },
      ],
    });

    return phases;
  }

  /**
   * Translate RENAME_TABLE intent
   */
  private translateRenameTable(intent: SchemaIntent): IntentPhase[] {
    const table = intent.payload.table;
    const newTable = intent.payload.newTable!;
    const options = intent.payload.options;

    const phases: IntentPhase[] = [];

    // Phase 1: EXPAND - Validate table exists and no conflicts
    phases.push({
      phase: "EXPAND",
      operations: [
        {
          type: "VALIDATION",
          sql: `SELECT COUNT(*) FROM information_schema.tables WHERE table_name = '${newTable}'`,
          description: `Check new table name is not already in use`,
          estimatedTime: "00:00:05",
        },
      ],
      dependencies: [],
      estimatedDuration: "00:00:10",
      rollbackOperations: [],
    });

    // Phase 2: CONTRACT - Rename table
    phases.push({
      phase: "CONTRACT",
      operations: [
        {
          type: "SQL",
          sql: `ALTER TABLE ${table} RENAME TO ${newTable}`,
          description: `Rename table from ${table} to ${newTable}`,
          estimatedTime: "00:00:05",
          requiresApproval: true,
        },
      ],
      dependencies: ["EXPAND"],
      estimatedDuration: "00:00:10",
      rollbackOperations: [
        {
          type: "SQL",
          sql: `ALTER TABLE ${newTable} RENAME TO ${table}`,
          description: `Restore original table name`,
        },
      ],
    });

    return phases;
  }

  /**
   * Translate SPLIT_TABLE intent
   */
  private translateSplitTable(intent: SchemaIntent): IntentPhase[] {
    const table = intent.payload.table;
    const newTable = intent.payload.newTable!;
    const columns = intent.payload.columns!;
    const options = intent.payload.options;

    const phases: IntentPhase[] = [];

    // Phase 1: EXPAND - Create new table
    phases.push({
      phase: "EXPAND",
      operations: [
        {
          type: "SQL",
          sql: `CREATE TABLE ${newTable} AS SELECT ${columns.join(", ")} FROM ${table} WHERE 1=0`,
          description: `Create new table ${newTable} with selected columns`,
          estimatedTime: "00:00:10",
        },
      ],
      dependencies: [],
      estimatedDuration: "00:00:15",
      rollbackOperations: [
        {
          type: "SQL",
          sql: `DROP TABLE ${newTable}`,
          description: `Remove new table ${newTable}`,
        },
      ],
    });

    // Phase 2: DATA - Migrate data
    phases.push({
      phase: "DATA",
      operations: [
        {
          type: "BACKFILL",
          sql: `INSERT INTO ${newTable} SELECT ${columns.join(", ")} FROM ${table}`,
          description: `Copy data to new table ${newTable}`,
          estimatedTime: options?.estimatedRows
            ? `${Math.ceil(options.estimatedRows / 5000)} minutes`
            : "00:05:00",
          requiresApproval: options?.downtimeRequired || false,
        },
      ],
      dependencies: ["EXPAND"],
      estimatedDuration: options?.estimatedRows
        ? `${Math.ceil(options.estimatedRows / 5000)} minutes`
        : "00:05:00",
      rollbackOperations: [
        {
          type: "SQL",
          sql: `TRUNCATE TABLE ${newTable}`,
          description: `Clear data from new table`,
        },
      ],
    });

    // Phase 3: CONTRACT - Remove columns from original table
    phases.push({
      phase: "CONTRACT",
      operations: [
        {
          type: "SQL",
          sql: `ALTER TABLE ${table} DROP COLUMN ${columns.join(", DROP COLUMN ")}`,
          description: `Remove split columns from original table`,
          estimatedTime: "00:00:10",
          requiresApproval: true,
        },
      ],
      dependencies: ["DATA"],
      estimatedDuration: "00:00:15",
      rollbackOperations: [
        {
          type: "SQL",
          sql: `ALTER TABLE ${table} ADD COLUMN ${columns.join(" VARCHAR(255), ADD COLUMN ")} VARCHAR(255)`,
          description: `Restore columns to original table`,
        },
      ],
    });

    return phases;
  }

  /**
   * Translate MERGE_TABLES intent
   */
  private translateMergeTables(intent: SchemaIntent): IntentPhase[] {
    const targetTable = intent.payload.newTable!;
    const sourceTable = intent.payload.oldTable!;
    const options = intent.payload.options;

    const phases: IntentPhase[] = [];

    // Phase 1: EXPAND - Validate tables and columns
    phases.push({
      phase: "EXPAND",
      operations: [
        {
          type: "VALIDATION",
          sql: `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '${sourceTable}'`,
          description: `Get source table schema`,
          estimatedTime: "00:00:05",
        },
        {
          type: "VALIDATION",
          sql: `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = '${targetTable}'`,
          description: `Get target table schema`,
          estimatedTime: "00:00:05",
        },
      ],
      dependencies: [],
      estimatedDuration: "00:00:15",
      rollbackOperations: [],
    });

    // Phase 2: DATA - Merge data
    phases.push({
      phase: "DATA",
      operations: [
        {
          type: "BACKFILL",
          sql: `INSERT INTO ${targetTable} SELECT * FROM ${sourceTable}`,
          description: `Merge data from ${sourceTable} to ${targetTable}`,
          estimatedTime: options?.estimatedRows
            ? `${Math.ceil(options.estimatedRows / 10000)} minutes`
            : "00:10:00",
          requiresApproval: options?.downtimeRequired || false,
        },
      ],
      dependencies: ["EXPAND"],
      estimatedDuration: options?.estimatedRows
        ? `${Math.ceil(options.estimatedRows / 10000)} minutes`
        : "00:10:00",
      rollbackOperations: [
        {
          type: "SQL",
          sql: `DELETE FROM ${targetTable} WHERE id IN (SELECT id FROM ${sourceTable})`,
          description: `Remove merged data from target table`,
        },
      ],
    });

    // Phase 3: CONTRACT - Drop source table
    phases.push({
      phase: "CONTRACT",
      operations: [
        {
          type: "SQL",
          sql: `DROP TABLE ${sourceTable}`,
          description: `Remove source table ${sourceTable}`,
          estimatedTime: "00:00:05",
          requiresApproval: true,
        },
      ],
      dependencies: ["DATA"],
      estimatedDuration: "00:00:10",
      rollbackOperations: [
        {
          type: "SQL",
          sql: `CREATE TABLE ${sourceTable} AS SELECT * FROM ${targetTable} WHERE 1=0`,
          description: `Restore source table structure`,
        },
      ],
    });

    return phases;
  }

  /**
   * Calculate estimated time for all phases
   */
  private calculateEstimatedTime(phases: IntentPhase[]): string {
    let totalSeconds = 0;

    for (const phase of phases) {
      for (const operation of phase.operations) {
        if (operation.estimatedTime) {
          const [hours, minutes, seconds] = operation.estimatedTime
            .split(":")
            .map(Number);
          totalSeconds +=
            (hours || 0) * 3600 + (minutes || 0) * 60 + (seconds || 0);
        }
      }
    }

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return `${hours.toString().padStart(2, "0")}:${minutes
      .toString()
      .padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
  }

  /**
   * Determine required approvals based on intent and phases
   */
  private determineApprovals(
    intent: SchemaIntent,
    phases: IntentPhase[],
  ): string[] {
    const approvals: string[] = [];

    // Check for high-risk operations
    for (const phase of phases) {
      for (const operation of phase.operations) {
        if (operation.requiresApproval) {
          approvals.push("Database Administrator");
          break;
        }
      }
    }

    // Check intent priority
    if (intent.metadata.priority === "CRITICAL") {
      approvals.push("Engineering Manager");
    }

    // Check estimated impact
    if (intent.metadata.estimatedImpact === "MASSIVE") {
      approvals.push("CTO");
    }

    return [...new Set(approvals)]; // Remove duplicates
  }

  /**
   * Generate rollback plan from phases
   */
  private generateRollbackPlan(phases: IntentPhase[]): string[] {
    const rollbackPlan: string[] = [];

    // Reverse the order of phases for rollback
    for (let i = phases.length - 1; i >= 0; i--) {
      const phase = phases[i];
      for (const operation of phase.rollbackOperations) {
        rollbackPlan.push(operation.description);
      }
    }

    return rollbackPlan;
  }
}