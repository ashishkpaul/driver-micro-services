/**
 * Compatibility Analysis Engine
 *
 * Analyzes schema operations for backward compatibility, API compatibility,
 * and migration compatibility issues.
 */

import { SchemaOperation, CompatibilityReport } from "./types";

/**
 * Check compatibility for all operations in a migration plan
 */
export function checkCompatibility(
  operations: SchemaOperation[],
): CompatibilityReport {
  console.log("  Checking compatibility...");

  const report: CompatibilityReport = {
    breakingChanges: [],
    backwardCompatible: true,
    apiCompatibility: true,
    migrationCompatibility: true,
    recommendations: [],
  };

  // Check for breaking changes
  const breakingChanges = findBreakingChanges(operations);
  report.breakingChanges = breakingChanges;
  report.backwardCompatible = breakingChanges.length === 0;

  // Check API compatibility
  const apiIssues = checkApiCompatibility(operations);
  report.apiCompatibility = apiIssues.length === 0;
  if (!report.apiCompatibility) {
    report.recommendations.push(...apiIssues);
  }

  // Check migration compatibility
  const migrationIssues = checkMigrationCompatibility(operations);
  report.migrationCompatibility = migrationIssues.length === 0;
  if (!report.migrationCompatibility) {
    report.recommendations.push(...migrationIssues);
  }

  console.log(
    `  Compatibility check complete: ${breakingChanges.length} breaking changes, ${apiIssues.length} API issues, ${migrationIssues.length} migration issues`,
  );

  return report;
}

/**
 * Find breaking changes in operations
 */
function findBreakingChanges(operations: SchemaOperation[]): string[] {
  const breakingChanges: string[] = [];

  for (const operation of operations) {
    // DROP operations are always breaking
    if (operation.sql.match(/\bDROP\s+(TABLE|COLUMN|TYPE|CONSTRAINT)\b/i)) {
      breakingChanges.push(`DROP operation: ${operation.sql}`);
    }

    // Column type changes are breaking
    if (operation.sql.match(/\bALTER\s+COLUMN.*TYPE\b/i)) {
      breakingChanges.push(`Column type change: ${operation.sql}`);
    }

    // Column renames are breaking
    if (operation.sql.match(/\bRENAME\s+COLUMN\b/i)) {
      breakingChanges.push(`Column rename: ${operation.sql}`);
    }

    // SET NOT NULL without default is breaking
    if (
      operation.sql.match(/\bSET\s+NOT\s+NULL\b/i) &&
      !operation.sql.match(/\bDEFAULT\b/i)
    ) {
      breakingChanges.push(`SET NOT NULL without default: ${operation.sql}`);
    }

    // Dropping constraints is breaking
    if (operation.sql.match(/\bDROP\s+CONSTRAINT\b/i)) {
      breakingChanges.push(`Constraint removal: ${operation.sql}`);
    }
  }

  return breakingChanges;
}

/**
 * Check API compatibility issues
 */
function checkApiCompatibility(operations: SchemaOperation[]): string[] {
  const issues: string[] = [];

  for (const operation of operations) {
    // Column renames break API contracts
    if (operation.sql.match(/\bRENAME\s+COLUMN\b/i)) {
      const match = operation.sql.match(
        /\bRENAME\s+COLUMN\s+["']?(\w+)["']?\s+TO\s+["']?(\w+)["']?/i,
      );
      if (match) {
        issues.push(
          `API breaking: Column "${match[1]}" renamed to "${match[2]}" - update all API consumers`,
        );
      }
    }

    // Column type changes break API contracts
    if (operation.sql.match(/\bALTER\s+COLUMN.*TYPE\b/i)) {
      const match = operation.sql.match(
        /\bALTER\s+COLUMN\s+["']?(\w+)["']?\s+TYPE\s+(\w+)/i,
      );
      if (match) {
        issues.push(
          `API breaking: Column "${match[1]}" type changed to ${match[2]} - update API schemas`,
        );
      }
    }

    // Table drops break API contracts
    if (operation.sql.match(/\bDROP\s+TABLE\b/i)) {
      const match = operation.sql.match(/\bDROP\s+TABLE\s+["']?(\w+)["']?/i);
      if (match) {
        issues.push(
          `API breaking: Table "${match[1]}" dropped - remove all API endpoints`,
        );
      }
    }

    // Column drops break API contracts
    if (operation.sql.match(/\bDROP\s+COLUMN\b/i)) {
      const match = operation.sql.match(/\bDROP\s+COLUMN\s+["']?(\w+)["']?/i);
      if (match) {
        issues.push(
          `API breaking: Column "${match[1]}" dropped - update API responses`,
        );
      }
    }
  }

  return issues;
}

/**
 * Check migration compatibility issues
 */
function checkMigrationCompatibility(operations: SchemaOperation[]): string[] {
  const issues: string[] = [];

  // Check for mixed operations that should be separated
  const hasBreaking = operations.some((op) => op.category === "BREAKING");
  const hasSafe = operations.some((op) => op.category === "SAFE");
  const hasData = operations.some((op) => op.category === "DATA");

  if (hasBreaking && hasSafe) {
    issues.push(
      "Mixed SAFE and BREAKING operations - use expand-contract pattern",
    );
  }

  if (hasBreaking && hasData) {
    issues.push(
      "Mixed DATA and BREAKING operations - ensure data operations complete before breaking changes",
    );
  }

  // Check for operations that need specific ordering
  const tableOperations = groupOperationsByTable(operations);

  for (const [tableName, ops] of Object.entries(tableOperations)) {
    // Check for ADD COLUMN + SET NOT NULL in same migration
    const addColumnOps = ops.filter((op) => op.sql.match(/\bADD\s+COLUMN\b/i));
    const setNotNullOps = ops.filter((op) =>
      op.sql.match(/\bSET\s+NOT\s+NULL\b/i),
    );

    if (addColumnOps.length > 0 && setNotNullOps.length > 0) {
      issues.push(
        `Table "${tableName}": ADD COLUMN and SET NOT NULL should be separated into different phases`,
      );
    }

    // Check for DROP COLUMN before data migration
    const dropColumnOps = ops.filter((op) =>
      op.sql.match(/\bDROP\s+COLUMN\b/i),
    );
    const dataOps = ops.filter((op) => op.category === "DATA");

    if (dropColumnOps.length > 0 && dataOps.length > 0) {
      issues.push(
        `Table "${tableName}": Data operations should complete before DROP COLUMN`,
      );
    }
  }

  return issues;
}

/**
 * Group operations by table
 */
function groupOperationsByTable(
  operations: SchemaOperation[],
): Record<string, SchemaOperation[]> {
  const grouped: Record<string, SchemaOperation[]> = {};

  for (const operation of operations) {
    const tables = extractTableReferences(operation.sql);

    for (const table of tables) {
      if (!grouped[table]) {
        grouped[table] = [];
      }
      grouped[table].push(operation);
    }
  }

  return grouped;
}

/**
 * Extract table references from SQL statement
 */
function extractTableReferences(sql: string): string[] {
  const tables: string[] = [];

  // Match various table reference patterns
  const patterns = [
    /(?:FROM|INTO|UPDATE|TABLE|JOIN)\s+["']?(\w+)["']?/gi,
    /ALTER\s+TABLE\s+["']?(\w+)["']?/gi,
    /DROP\s+(?:TABLE|INDEX)\s+["']?(\w+)["']?/gi,
    /CREATE\s+(?:TABLE|INDEX)\s+["']?(\w+)["']?/gi,
  ];

  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(sql)) !== null) {
      const tableName = match[1].toLowerCase();
      if (!tables.includes(tableName)) {
        tables.push(tableName);
      }
    }
  }

  return tables;
}

/**
 * Generate compatibility recommendations
 */
export function generateRecommendations(
  operations: SchemaOperation[],
): string[] {
  const recommendations: string[] = [];

  // Check for large table operations
  const largeTableOps = operations.filter(
    (op) => op.metadata?.tableSize === "LARGE",
  );
  if (largeTableOps.length > 0) {
    recommendations.push(
      "Large table operations detected - schedule during maintenance window",
    );
  }

  // Check for blocking operations
  const blockingOps = operations.filter((op) => op.metadata?.blocking);
  if (blockingOps.length > 0) {
    recommendations.push(
      "Blocking operations detected - consider using pg_repack for large tables",
    );
  }

  // Check for data loss operations
  const dataLossOps = operations.filter(
    (op) =>
      op.sql.match(/\bDROP\s+(TABLE|COLUMN)\b/i) ||
      op.sql.match(/\bDELETE\s+FROM\b/i),
  );
  if (dataLossOps.length > 0) {
    recommendations.push(
      "Data loss operations detected - ensure proper backups and validation",
    );
  }

  // Check for complex operations that need splitting
  const complexOps = operations.filter(
    (op) =>
      op.sql.match(/\bALTER\s+COLUMN.*TYPE\b/i) ||
      (op.sql.match(/\bADD\s+COLUMN\b/i) && op.sql.match(/\bNOT\s+NULL\b/i)),
  );
  if (complexOps.length > 0) {
    recommendations.push(
      "Complex operations detected - consider using expand-contract pattern",
    );
  }

  return recommendations;
}

/**
 * Get compatibility summary
 */
export function getCompatibilitySummary(operations: SchemaOperation[]): {
  isCompatible: boolean;
  breakingChangesCount: number;
  apiIssuesCount: number;
  migrationIssuesCount: number;
  recommendationsCount: number;
} {
  const report = checkCompatibility(operations);

  return {
    isCompatible:
      report.backwardCompatible &&
      report.apiCompatibility &&
      report.migrationCompatibility,
    breakingChangesCount: report.breakingChanges.length,
    apiIssuesCount: report.recommendations.filter((r) => r.includes("API"))
      .length,
    migrationIssuesCount: report.recommendations.filter(
      (r) => r.includes("migration") || r.includes("phase"),
    ).length,
    recommendationsCount: report.recommendations.length,
  };
}
