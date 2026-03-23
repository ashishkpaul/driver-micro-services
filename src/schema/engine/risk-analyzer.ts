/**
 * Risk Analysis Engine
 *
 * Analyzes schema operations for production risks including performance impact,
 * data loss potential, blocking behavior, and compatibility issues.
 */

import { SchemaOperation, RiskReport, OperationMetadata } from "./types";

/**
 * Analyze risks for all operations in a migration plan
 */
export function analyzeRisk(operations: SchemaOperation[]): RiskReport[] {
  console.log("  Analyzing risks for operations...");

  const risks: RiskReport[] = [];

  for (const operation of operations) {
    const operationRisks = analyzeSingleOperation(operation);
    risks.push(...operationRisks);
  }

  console.log(`  Risk analysis complete: ${risks.length} risks identified`);

  return risks;
}

/**
 * Analyze risks for a single operation
 */
function analyzeSingleOperation(operation: SchemaOperation): RiskReport[] {
  const risks: RiskReport[] = [];

  // Analyze performance risks
  const performanceRisks = analyzePerformanceRisks(operation);
  risks.push(...performanceRisks);

  // Analyze data loss risks
  const dataLossRisks = analyzeDataLossRisks(operation);
  risks.push(...dataLossRisks);

  // Analyze blocking risks
  const blockingRisks = analyzeBlockingRisks(operation);
  risks.push(...blockingRisks);

  // Analyze compatibility risks
  const compatibilityRisks = analyzeCompatibilityRisks(operation);
  risks.push(...compatibilityRisks);

  return risks;
}

/**
 * Analyze performance-related risks
 */
function analyzePerformanceRisks(operation: SchemaOperation): RiskReport[] {
  const risks: RiskReport[] = [];
  const metadata = operation.metadata as OperationMetadata;

  // Large table operations
  if (metadata?.tableSize === "LARGE") {
    risks.push({
      operation: operation.sql,
      severity: "HIGH",
      category: "PERFORMANCE",
      description: `Large table operation on ${metadata.estimatedRows} rows, estimated time: ${metadata.estimatedTime}`,
      mitigation:
        "Consider running during maintenance window with proper monitoring",
      requiresApproval: true,
    });
  }

  // Table rewrites
  if (operation.sql.match(/\bALTER\s+COLUMN.*TYPE\b/i)) {
    risks.push({
      operation: operation.sql,
      severity: "CRITICAL",
      category: "PERFORMANCE",
      description: "Column type change will cause full table rewrite",
      mitigation: "Use expand-contract pattern with temporary column",
      requiresApproval: true,
    });
  }

  // Index creation without CONCURRENTLY
  if (
    operation.sql.match(/\bCREATE\s+INDEX\b/i) &&
    !operation.sql.includes("CONCURRENTLY")
  ) {
    risks.push({
      operation: operation.sql,
      severity: "MEDIUM",
      category: "PERFORMANCE",
      description: "Index creation will block table writes",
      mitigation: "Use CREATE INDEX CONCURRENTLY for production",
      requiresApproval: false,
    });
  }

  // Full table scans in UPDATE/DELETE
  if (
    (operation.sql.match(/\bUPDATE\b/i) ||
      operation.sql.match(/\bDELETE\b/i)) &&
    !operation.sql.match(/\bWHERE.*=.*\?/i)
  ) {
    risks.push({
      operation: operation.sql,
      severity: "MEDIUM",
      category: "PERFORMANCE",
      description: "Operation may cause full table scan",
      mitigation: "Ensure proper WHERE clause with indexed columns",
      requiresApproval: false,
    });
  }

  return risks;
}

/**
 * Analyze data loss risks
 */
function analyzeDataLossRisks(operation: SchemaOperation): RiskReport[] {
  const risks: RiskReport[] = [];

  // DROP operations
  if (operation.sql.match(/\bDROP\s+(TABLE|COLUMN|TYPE)\b/i)) {
    risks.push({
      operation: operation.sql,
      severity: "CRITICAL",
      category: "DATA_LOSS",
      description: "DROP operation will permanently remove data",
      mitigation: "Ensure data backup and verify no dependent code",
      requiresApproval: true,
    });
  }

  // SET NOT NULL without default
  if (
    operation.sql.match(/\bSET\s+NOT\s+NULL\b/i) &&
    !operation.sql.match(/\bDEFAULT\b/i)
  ) {
    risks.push({
      operation: operation.sql,
      severity: "HIGH",
      category: "DATA_LOSS",
      description: "SET NOT NULL will fail if null values exist",
      mitigation: "Add default value or backfill data first",
      requiresApproval: true,
    });
  }

  // DELETE without WHERE
  if (
    operation.sql.match(/\bDELETE\s+FROM\b/i) &&
    !operation.sql.match(/\bWHERE\b/i)
  ) {
    risks.push({
      operation: operation.sql,
      severity: "CRITICAL",
      category: "DATA_LOSS",
      description: "DELETE without WHERE will remove all rows",
      mitigation: "Add WHERE clause or use TRUNCATE if intentional",
      requiresApproval: true,
    });
  }

  return risks;
}

/**
 * Analyze blocking risks
 */
function analyzeBlockingRisks(operation: SchemaOperation): RiskReport[] {
  const risks: RiskReport[] = [];
  const metadata = operation.metadata as OperationMetadata;

  // Operations that require table locks
  if (metadata?.blocking) {
    risks.push({
      operation: operation.sql,
      severity: "HIGH",
      category: "BLOCKING",
      description: "Operation will block table access",
      mitigation: "Schedule during low-traffic periods",
      requiresApproval: true,
    });
  }

  // DDL operations that lock schema
  if (operation.sql.match(/\bALTER\s+(TABLE|COLUMN)\b/i)) {
    risks.push({
      operation: operation.sql,
      severity: "MEDIUM",
      category: "BLOCKING",
      description: "ALTER operation will lock table schema",
      mitigation: "Consider using pg_repack for large tables",
      requiresApproval: false,
    });
  }

  // Long-running operations
  if (metadata?.estimatedTime && metadata.estimatedTime.includes("minutes")) {
    risks.push({
      operation: operation.sql,
      severity: "MEDIUM",
      category: "BLOCKING",
      description: `Long-running operation estimated at ${metadata.estimatedTime}`,
      mitigation: "Monitor progress and have rollback plan ready",
      requiresApproval: false,
    });
  }

  return risks;
}

/**
 * Analyze compatibility risks
 */
function analyzeCompatibilityRisks(operation: SchemaOperation): RiskReport[] {
  const risks: RiskReport[] = [];

  // Breaking schema changes
  if (operation.category === "BREAKING") {
    risks.push({
      operation: operation.sql,
      severity: "HIGH",
      category: "COMPATIBILITY",
      description: "Breaking schema change detected",
      mitigation: "Ensure application code is updated and deployed first",
      requiresApproval: true,
    });
  }

  // Column type changes
  if (operation.sql.match(/\bALTER\s+COLUMN.*TYPE\b/i)) {
    risks.push({
      operation: operation.sql,
      severity: "HIGH",
      category: "COMPATIBILITY",
      description: "Column type change may break application code",
      mitigation: "Update application code to handle new type",
      requiresApproval: true,
    });
  }

  // Column renames
  if (operation.sql.match(/\bRENAME\s+COLUMN\b/i)) {
    risks.push({
      operation: operation.sql,
      severity: "HIGH",
      category: "COMPATIBILITY",
      description: "Column rename will break existing queries",
      mitigation: "Update all references to old column name",
      requiresApproval: true,
    });
  }

  // Constraint changes
  if (operation.sql.match(/\bDROP\s+CONSTRAINT\b/i)) {
    risks.push({
      operation: operation.sql,
      severity: "MEDIUM",
      category: "COMPATIBILITY",
      description: "Dropping constraint may allow invalid data",
      mitigation: "Ensure application validates data appropriately",
      requiresApproval: false,
    });
  }

  return risks;
}

/**
 * Calculate overall risk score for operations
 */
export function calculateRiskScore(operations: SchemaOperation[]): number {
  const risks = analyzeRisk(operations);

  let score = 0;

  for (const risk of risks) {
    switch (risk.severity) {
      case "LOW":
        score += 1;
        break;
      case "MEDIUM":
        score += 3;
        break;
      case "HIGH":
        score += 5;
        break;
      case "CRITICAL":
        score += 10;
        break;
    }
  }

  return score;
}

/**
 * Get risk summary
 */
export function getRiskSummary(operations: SchemaOperation[]): {
  totalRisks: number;
  criticalRisks: number;
  highRisks: number;
  mediumRisks: number;
  lowRisks: number;
  requiresApproval: number;
} {
  const risks = analyzeRisk(operations);

  return {
    totalRisks: risks.length,
    criticalRisks: risks.filter((r) => r.severity === "CRITICAL").length,
    highRisks: risks.filter((r) => r.severity === "HIGH").length,
    mediumRisks: risks.filter((r) => r.severity === "MEDIUM").length,
    lowRisks: risks.filter((r) => r.severity === "LOW").length,
    requiresApproval: risks.filter((r) => r.requiresApproval).length,
  };
}
