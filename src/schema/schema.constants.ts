/**
 * Schema Control Plane Constants
 *
 * Centralized constants for the schema control plane system.
 */

/**
 * Required schema version for the application to boot.
 * This should be updated when new migrations are added that are required for the application to function.
 * 
 * Current value: 1774246118589 (placeholder - should be updated to latest migration timestamp)
 */
export const REQUIRED_SCHEMA_VERSION = "1774246118589";

/**
 * Application-specific lock key for distributed locking.
 * Must be consistent across all environments. Never reuse the same key for a
 * different application on the same Postgres instance.
 */
export const SCHEMA_LOCK_KEY = 847291;

/**
 * Schema convergence states
 */
export enum SchemaConvergenceState {
  PENDING = "PENDING",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
}

/**
 * Schema operation categories
 */
export enum SchemaOperationCategory {
  SAFE = "SAFE",
  DATA = "DATA",
  BREAKING = "BREAKING",
  FIX = "FIX",
}

/**
 * Schema risk levels
 */
export enum SchemaRiskLevel {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
  CRITICAL = "CRITICAL",
}

/**
 * Schema compatibility types
 */
export enum SchemaCompatibilityType {
  PERFORMANCE = "PERFORMANCE",
  DATA_LOSS = "DATA_LOSS",
  BLOCKING = "BLOCKING",
  COMPATIBILITY = "COMPATIBILITY",
}

/**
 * Schema drift types
 */
export enum SchemaDriftType {
  ENTITY = "ENTITY",
  MIGRATION = "MIGRATION",
  SCHEMA = "SCHEMA",
}

/**
 * Schema drift severity levels
 */
export enum SchemaDriftSeverity {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
  CRITICAL = "CRITICAL",
}

/**
 * Schema drift action types
 */
export enum SchemaDriftActionType {
  GENERATE_MIGRATIONS = "GENERATE_MIGRATIONS",
  EXECUTE_MIGRATIONS = "EXECUTE_MIGRATIONS",
  RESOLVE_SCHEMA_CONFLICTS = "RESOLVE_SCHEMA_CONFLICTS",
}

/**
 * Schema lifecycle phases
 */
export enum SchemaLifecyclePhase {
  EXPAND = "EXPAND",
  DATA = "DATA",
  CONTRACT = "CONTRACT",
  FIX = "FIX",
}

/**
 * Schema table sizes for risk assessment
 */
export enum SchemaTableSize {
  SMALL = "SMALL",
  MEDIUM = "MEDIUM",
  LARGE = "LARGE",
}

/**
 * Schema telemetry metrics
 */
export const SCHEMA_TELEMETRY_METRICS = {
  CONVERGENCE_DURATION: "schema_convergence_duration",
  AUTO_REPAIRS_EXECUTED: "auto_repairs_executed",
  DRIFT_DETECTED: "drift_detected",
  MIGRATION_EXECUTION_TIME: "migration_execution_time",
  LOCK_ACQUISITION_TIME: "lock_acquisition_time",
} as const;

/**
 * Schema validation error codes
 */
export const SCHEMA_VALIDATION_ERRORS = {
  CRITICAL_RISKS: "CRITICAL_RISKS",
  BREAKING_CHANGES: "BREAKING_CHANGES",
  MIXED_PHASES: "MIXED_PHASES",
  LARGE_TABLE_OPERATIONS: "LARGE_TABLE_OPERATIONS",
  LOCK_ACQUISITION_FAILED: "LOCK_ACQUISITION_FAILED",
  DRIFT_DETECTED: "DRIFT_DETECTED",
} as const;

/**
 * Schema validation warning codes
 */
export const SCHEMA_VALIDATION_WARNINGS = {
  LARGE_TABLE_OPERATIONS: "LARGE_TABLE_OPERATIONS",
  MIXED_PHASES: "MIXED_PHASES",
  MANUAL_REVIEW_REQUIRED: "MANUAL_REVIEW_REQUIRED",
} as const;