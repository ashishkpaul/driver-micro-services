/**
 * Migration Engine Type Definitions
 *
 * Centralized type definitions for the automated migration system.
 */

export type SqlCategory = "SAFE" | "DATA" | "BREAKING" | "FIX";

export type MigrationType = "SAFE" | "DATA" | "BREAKING";

export type Prefix = "SAFE_" | "DATA_" | "BREAKING_" | "FIX_" | "BASELINE_";

export interface ClassifiedStatement {
  sql: string;
  category: SqlCategory;
  reason: string;
}

export interface MigrationLifecycleSet {
  safe: SchemaOperation[];
  data: SchemaOperation[];
  breaking: SchemaOperation[];
}

export interface MigrationClassification {
  categories: Set<SqlCategory>;
  statements: ClassifiedStatement[];
  dominantPrefix: Prefix;
  needsPhaseDecomposition: boolean;
  phases: SqlCategory[];
}

export interface CompanionMigration {
  phase: "DATA" | "BREAKING";
  sql: string;
  reason: string;
}

export interface HeaderOptions {
  prefix: Prefix;
  description?: string;
  phase?: string;
  phaseTotal?: number;
  companions?: string[];
  isAutoFixed?: boolean;
}

export interface SchemaDiff {
  up: string[];
  down: string[];
}

export interface MigrationGenerationOptions {
  name: string;
  outputDir: string;
  config: string;
}

export interface LifecycleSplitResult {
  safe: string[];
  data: string[];
  breaking: string[];
  companions: CompanionMigration[];
}

// Schema Planning Types
export interface SchemaSnapshot {
  tables: TableSchema[];
  indexes: IndexSchema[];
  constraints: ConstraintSchema[];
  enums: EnumSchema[];
}

export interface TableSchema {
  name: string;
  columns: ColumnSchema[];
  indexes: string[];
  constraints: string[];
}

export interface ColumnSchema {
  name: string;
  type: string;
  nullable: boolean;
  default?: string;
  primaryKey: boolean;
  unique: boolean;
}

export interface IndexSchema {
  name: string;
  table: string;
  columns: string[];
  unique: boolean;
}

export interface ConstraintSchema {
  name: string;
  table: string;
  type: "PRIMARY KEY" | "FOREIGN KEY" | "UNIQUE" | "CHECK" | "NOT NULL";
  definition: string;
}

export interface EnumSchema {
  name: string;
  values: string[];
}

export interface SchemaDiff {
  up: string[];
  down: string[];
  newTables: string[];
  droppedTables: string[];
  alteredTables: string[];
}

export interface OperationMetadata {
  tableSize?: "SMALL" | "MEDIUM" | "LARGE";
  estimatedRows?: number;
  estimatedTime?: string;
  blocking?: boolean;
  requiresDowntime?: boolean;
}

export interface SchemaOperation {
  sql: string;
  category: SqlCategory;
  reason: string;
  metadata?: OperationMetadata;
  dependencies: string[];
  conflicts: string[];
}

export interface PhasePlan {
  phase: "EXPAND" | "DATA" | "CONTRACT" | "FIX";
  operations: SchemaOperation[];
  order: string[];
}

export interface MigrationPlan {
  operations: SchemaOperation[];
  phases: PhasePlan[];
  graph: OperationGraph;
  risks: RiskReport[];
  compatibility: CompatibilityReport;
  metadata: {
    entitySnapshot: SchemaSnapshot;
    databaseSnapshot: SchemaSnapshot;
    diff: SchemaDiff;
    createdAt: string;
    version: string;
  };
}

export interface OperationGraph {
  nodes: Map<string, SchemaOperation>;
  edges: Map<string, string[]>;
  roots: string[];
  leaves: string[];
}

export interface RiskReport {
  operation: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  category: "PERFORMANCE" | "DATA_LOSS" | "BLOCKING" | "COMPATIBILITY";
  description: string;
  mitigation?: string;
  requiresApproval: boolean;
}

export interface CompatibilityReport {
  breakingChanges: string[];
  backwardCompatible: boolean;
  apiCompatibility: boolean;
  migrationCompatibility: boolean;
  recommendations: string[];
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  score: number;
}
