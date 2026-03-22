/**
 * Schema Intent System
 *
 * Provides a declarative way for developers to specify schema evolution goals
 * without writing complex migration logic. The system translates intents into
 * safe Expand-Migrate-Contract patterns automatically.
 */

export interface SchemaIntent {
  version: string;
  type: IntentType;
  metadata: IntentMetadata;
  payload: IntentPayload;
}

export type IntentType =
  | "RENAME_COLUMN"
  | "CHANGE_COLUMN_TYPE"
  | "ADD_COLUMN"
  | "DROP_COLUMN"
  | "ADD_INDEX"
  | "DROP_INDEX"
  | "ADD_CONSTRAINT"
  | "DROP_CONSTRAINT"
  | "RENAME_TABLE"
  | "SPLIT_TABLE"
  | "MERGE_TABLES";

export interface IntentMetadata {
  author: string;
  description: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  estimatedImpact: "MINIMAL" | "MODERATE" | "SIGNIFICANT" | "MASSIVE";
  created: string;
  tags?: string[];
}

export interface IntentPayload {
  // Common fields
  table: string;
  column?: string;
  newColumn?: string;
  newTable?: string;
  oldColumn?: string;
  oldTable?: string;

  // Type-specific fields
  newType?: string;
  indexName?: string;
  columns?: string[];
  constraintName?: string;
  constraintType?: "UNIQUE" | "FOREIGN_KEY" | "CHECK" | "NOT_NULL";
  constraintDefinition?: string;
  foreignKey?: {
    table: string;
    column: string;
    onDelete?: "CASCADE" | "RESTRICT" | "SET_NULL";
    onUpdate?: "CASCADE" | "RESTRICT" | "SET_NULL";
  };

  // Advanced options
  options?: {
    backfillStrategy?: "BATCH" | "STREAMING" | "OFFLINE";
    batchSize?: number;
    downtimeRequired?: boolean;
    estimatedRows?: number;
    rollbackStrategy?: "NONE" | "REVERSE" | "SNAPSHOT";
  };
}

export interface IntentValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  suggestions: string[];
}

export interface IntentTranslation {
  phases: IntentPhase[];
  estimatedTime: string;
  requiredApprovals: string[];
  rollbackPlan: string[];
}

export interface IntentPhase {
  phase: "EXPAND" | "DATA" | "CONTRACT";
  operations: IntentOperation[];
  dependencies: string[];
  estimatedDuration: string;
  rollbackOperations: IntentOperation[];
}

export interface IntentOperation {
  type: "SQL" | "BACKFILL" | "VALIDATION" | "CLEANUP";
  sql?: string;
  description: string;
  estimatedTime?: string;
  requiresApproval?: boolean;
  rollbackSql?: string;
}

/**
 * Schema Intent Parser
 *
 * Parses intent files and validates them against the schema intent specification.
 */
export class SchemaIntentParser {
  private static readonly SUPPORTED_VERSIONS = ["1.0"];

  /**
   * Parse and validate an intent file
   */
  public static parse(intentData: any): IntentValidation {
    const validation: IntentValidation = {
      valid: false,
      errors: [],
      warnings: [],
      suggestions: [],
    };

    // Check version
    if (!intentData.version) {
      validation.errors.push("Intent must specify a version");
      return validation;
    }

    if (!this.SUPPORTED_VERSIONS.includes(intentData.version)) {
      validation.errors.push(
        `Unsupported intent version: ${intentData.version}. Supported versions: ${this.SUPPORTED_VERSIONS.join(", ")}`,
      );
      return validation;
    }

    // Validate required fields
    if (!intentData.type) {
      validation.errors.push("Intent must specify a type");
    }

    if (!intentData.metadata) {
      validation.errors.push("Intent must include metadata");
    } else {
      if (!intentData.metadata.author) {
        validation.errors.push("Intent metadata must include author");
      }
      if (!intentData.metadata.description) {
        validation.errors.push("Intent metadata must include description");
      }
    }

    if (!intentData.payload) {
      validation.errors.push("Intent must include payload");
    } else {
      if (!intentData.payload.table) {
        validation.errors.push("Intent payload must include table name");
      }
    }

    // Validate intent-specific requirements
    const intentType = intentData.type as IntentType;
    const payload = intentData.payload;

    switch (intentType) {
      case "RENAME_COLUMN":
        this.validateRenameColumn(payload, validation);
        break;
      case "CHANGE_COLUMN_TYPE":
        this.validateChangeColumnType(payload, validation);
        break;
      case "ADD_COLUMN":
        this.validateAddColumn(payload, validation);
        break;
      case "DROP_COLUMN":
        this.validateDropColumn(payload, validation);
        break;
      case "ADD_INDEX":
        this.validateAddIndex(payload, validation);
        break;
      case "DROP_INDEX":
        this.validateDropIndex(payload, validation);
        break;
      case "ADD_CONSTRAINT":
        this.validateAddConstraint(payload, validation);
        break;
      case "DROP_CONSTRAINT":
        this.validateDropConstraint(payload, validation);
        break;
      case "RENAME_TABLE":
        this.validateRenameTable(payload, validation);
        break;
      case "SPLIT_TABLE":
        this.validateSplitTable(payload, validation);
        break;
      case "MERGE_TABLES":
        this.validateMergeTables(payload, validation);
        break;
    }

    // Check for common issues
    this.checkCommonIssues(intentData, validation);

    validation.valid = validation.errors.length === 0;
    return validation;
  }

  /**
   * Validate RENAME_COLUMN intent
   */
  private static validateRenameColumn(
    payload: IntentPayload,
    validation: IntentValidation,
  ): void {
    if (!payload.column) {
      validation.errors.push(
        "RENAME_COLUMN intent must specify old column name",
      );
    }
    if (!payload.newColumn) {
      validation.errors.push(
        "RENAME_COLUMN intent must specify new column name",
      );
    }
    if (payload.column === payload.newColumn) {
      validation.errors.push("Old and new column names must be different");
    }
  }

  /**
   * Validate CHANGE_COLUMN_TYPE intent
   */
  private static validateChangeColumnType(
    payload: IntentPayload,
    validation: IntentValidation,
  ): void {
    if (!payload.column) {
      validation.errors.push(
        "CHANGE_COLUMN_TYPE intent must specify column name",
      );
    }
    if (!payload.newType) {
      validation.errors.push("CHANGE_COLUMN_TYPE intent must specify new type");
    }
  }

  /**
   * Validate ADD_COLUMN intent
   */
  private static validateAddColumn(
    payload: IntentPayload,
    validation: IntentValidation,
  ): void {
    if (!payload.column) {
      validation.errors.push("ADD_COLUMN intent must specify column name");
    }
    if (!payload.newType) {
      validation.errors.push("ADD_COLUMN intent must specify column type");
    }
  }

  /**
   * Validate DROP_COLUMN intent
   */
  private static validateDropColumn(
    payload: IntentPayload,
    validation: IntentValidation,
  ): void {
    if (!payload.column) {
      validation.errors.push("DROP_COLUMN intent must specify column name");
    }
  }

  /**
   * Validate ADD_INDEX intent
   */
  private static validateAddIndex(
    payload: IntentPayload,
    validation: IntentValidation,
  ): void {
    if (!payload.indexName) {
      validation.errors.push("ADD_INDEX intent must specify index name");
    }
    if (!payload.columns || payload.columns.length === 0) {
      validation.errors.push("ADD_INDEX intent must specify columns");
    }
  }

  /**
   * Validate DROP_INDEX intent
   */
  private static validateDropIndex(
    payload: IntentPayload,
    validation: IntentValidation,
  ): void {
    if (!payload.indexName) {
      validation.errors.push("DROP_INDEX intent must specify index name");
    }
  }

  /**
   * Validate ADD_CONSTRAINT intent
   */
  private static validateAddConstraint(
    payload: IntentPayload,
    validation: IntentValidation,
  ): void {
    if (!payload.constraintName) {
      validation.errors.push(
        "ADD_CONSTRAINT intent must specify constraint name",
      );
    }
    if (!payload.constraintType) {
      validation.errors.push(
        "ADD_CONSTRAINT intent must specify constraint type",
      );
    }
  }

  /**
   * Validate DROP_CONSTRAINT intent
   */
  private static validateDropConstraint(
    payload: IntentPayload,
    validation: IntentValidation,
  ): void {
    if (!payload.constraintName) {
      validation.errors.push(
        "DROP_CONSTRAINT intent must specify constraint name",
      );
    }
  }

  /**
   * Validate RENAME_TABLE intent
   */
  private static validateRenameTable(
    payload: IntentPayload,
    validation: IntentValidation,
  ): void {
    if (!payload.newTable) {
      validation.errors.push("RENAME_TABLE intent must specify new table name");
    }
    if (payload.table === payload.newTable) {
      validation.errors.push("Old and new table names must be different");
    }
  }

  /**
   * Validate SPLIT_TABLE intent
   */
  private static validateSplitTable(
    payload: IntentPayload,
    validation: IntentValidation,
  ): void {
    if (!payload.newTable) {
      validation.errors.push("SPLIT_TABLE intent must specify new table name");
    }
    if (!payload.columns || payload.columns.length === 0) {
      validation.errors.push("SPLIT_TABLE intent must specify columns to move");
    }
  }

  /**
   * Validate MERGE_TABLES intent
   */
  private static validateMergeTables(
    payload: IntentPayload,
    validation: IntentValidation,
  ): void {
    if (!payload.newTable) {
      validation.errors.push(
        "MERGE_TABLES intent must specify target table name",
      );
    }
    if (!payload.oldTable) {
      validation.errors.push(
        "MERGE_TABLES intent must specify source table name",
      );
    }
  }

  /**
   * Check for common issues across all intent types
   */
  private static checkCommonIssues(
    intentData: any,
    validation: IntentValidation,
  ): void {
    const metadata = intentData.metadata;
    const payload = intentData.payload;

    // Check for overly long descriptions
    if (metadata.description && metadata.description.length > 500) {
      validation.warnings.push("Description is very long, consider shortening");
    }

    // Check for missing priority
    if (!metadata.priority) {
      validation.warnings.push(
        "Consider specifying priority for better planning",
      );
    }

    // Check for missing estimated impact
    if (!metadata.estimatedImpact) {
      validation.warnings.push(
        "Consider specifying estimated impact for better risk assessment",
      );
    }

    // Check for common naming conventions
    if (payload.column && !/^[a-z_][a-z0-9_]*$/.test(payload.column)) {
      validation.warnings.push(
        "Column name should follow snake_case convention",
      );
    }

    if (payload.table && !/^[a-z_][a-z0-9_]*$/.test(payload.table)) {
      validation.warnings.push(
        "Table name should follow snake_case convention",
      );
    }
  }

  /**
   * Create a sample intent template
   */
  public static createTemplate(type: IntentType): SchemaIntent {
    const baseTemplate: SchemaIntent = {
      version: "1.0",
      type,
      metadata: {
        author: "developer@example.com",
        description: "Describe the schema change intent",
        priority: "MEDIUM",
        estimatedImpact: "MODERATE",
        created: new Date().toISOString(),
        tags: ["schema-evolution"],
      },
      payload: {
        table: "your_table_name",
      },
    };

    switch (type) {
      case "RENAME_COLUMN":
        baseTemplate.payload.column = "old_column_name";
        baseTemplate.payload.newColumn = "new_column_name";
        baseTemplate.metadata.description =
          "Rename column from old_name to new_name";
        break;
      case "CHANGE_COLUMN_TYPE":
        baseTemplate.payload.column = "column_name";
        baseTemplate.payload.newType = "VARCHAR(255)";
        baseTemplate.metadata.description =
          "Change column type to VARCHAR(255)";
        break;
      case "ADD_COLUMN":
        baseTemplate.payload.column = "new_column_name";
        baseTemplate.payload.newType = "INTEGER";
        baseTemplate.metadata.description = "Add new integer column";
        break;
      case "DROP_COLUMN":
        baseTemplate.payload.column = "old_column_name";
        baseTemplate.metadata.description = "Remove deprecated column";
        break;
      case "ADD_INDEX":
        baseTemplate.payload.indexName = "idx_table_column";
        baseTemplate.payload.columns = ["column_name"];
        baseTemplate.metadata.description =
          "Add index for better query performance";
        break;
      case "DROP_INDEX":
        baseTemplate.payload.indexName = "idx_table_column";
        baseTemplate.metadata.description = "Remove unused index";
        break;
      case "ADD_CONSTRAINT":
        baseTemplate.payload.constraintName = "constraint_name";
        baseTemplate.payload.constraintType = "UNIQUE";
        baseTemplate.payload.columns = ["column_name"];
        baseTemplate.metadata.description = "Add unique constraint";
        break;
      case "DROP_CONSTRAINT":
        baseTemplate.payload.constraintName = "constraint_name";
        baseTemplate.metadata.description = "Remove constraint";
        break;
      case "RENAME_TABLE":
        baseTemplate.payload.newTable = "new_table_name";
        baseTemplate.metadata.description = "Rename table for better naming";
        break;
      case "SPLIT_TABLE":
        baseTemplate.payload.newTable = "new_table_name";
        baseTemplate.payload.columns = ["column1", "column2"];
        baseTemplate.metadata.description =
          "Split table to improve performance";
        break;
      case "MERGE_TABLES":
        baseTemplate.payload.newTable = "target_table";
        baseTemplate.payload.oldTable = "source_table";
        baseTemplate.metadata.description =
          "Merge tables for better organization";
        break;
    }

    return baseTemplate;
  }
}
