/**
 * Operational Rules
 *
 * Enforces operational SLAs and constraints based on database metadata
 * and maintenance window configurations.
 */

import { SchemaDiff } from "../types";

export interface OperationalViolation {
  rule: string;
  severity: "CRITICAL" | "WARNING" | "INFO";
  message: string;
  operation: string;
  suggestedFix?: string;
}

export interface OperationalValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface MaintenanceWindow {
  start: string;
  end: string;
  timezone: string;
}

/**
 * Operational Rules
 *
 * Implements rules that enforce operational constraints such as
 * maintenance windows, table size limits, and blocking operation restrictions.
 */
export class OperationalRules {
  private defaultMaintenanceWindow: MaintenanceWindow = {
    start: "02:00",
    end: "04:00",
    timezone: "UTC",
  };

  /**
   * Evaluate schema diff against operational rules
   */
  public evaluate(
    schemaDiff: SchemaDiff,
    databaseSnapshot: any,
    operationMetadata: Map<string, any>,
    maintenanceWindow?: MaintenanceWindow,
  ): OperationalViolation[] {
    console.log("⚙️  Evaluating operational rules...");

    const violations: OperationalViolation[] = [];
    const currentWindow = maintenanceWindow || this.defaultMaintenanceWindow;

    // Check for operations outside maintenance window
    const windowViolations = this.checkMaintenanceWindow(
      schemaDiff,
      currentWindow,
    );
    violations.push(...windowViolations);

    // Check for large table operations
    const sizeViolations = this.checkTableSizeLimits(
      schemaDiff,
      databaseSnapshot,
      operationMetadata,
    );
    violations.push(...sizeViolations);

    // Check for blocking operations
    const blockingViolations = this.checkBlockingOperations(
      schemaDiff,
      operationMetadata,
    );
    violations.push(...blockingViolations);

    // Check for concurrent operation conflicts
    const conflictViolations = this.checkOperationConflicts(
      schemaDiff,
      operationMetadata,
    );
    violations.push(...conflictViolations);

    console.log(
      `📋 Operational check complete: ${violations.length} violations`,
    );

    return violations;
  }

  /**
   * Check for operations outside maintenance window
   */
  private checkMaintenanceWindow(
    schemaDiff: SchemaDiff,
    maintenanceWindow: MaintenanceWindow,
  ): OperationalViolation[] {
    const violations: OperationalViolation[] = [];
    const now = new Date();

    // For now, we'll assume operations are being evaluated for immediate execution
    // In a real system, you'd check the scheduled execution time
    const currentHour = now.getHours();
    const maintenanceStart = parseInt(maintenanceWindow.start.split(":")[0]);
    const maintenanceEnd = parseInt(maintenanceWindow.end.split(":")[0]);

    // Simple check: if current time is not in maintenance window and we have blocking operations
    const isMaintenanceWindow =
      currentHour >= maintenanceStart && currentHour <= maintenanceEnd;

    if (!isMaintenanceWindow) {
      for (const sql of schemaDiff.up) {
        if (this.isBlockingOperation(sql)) {
          violations.push({
            rule: "OPERATION_OUTSIDE_MAINTENANCE_WINDOW",
            severity: "CRITICAL",
            message: `Blocking operation scheduled outside maintenance window (${maintenanceWindow.start}-${maintenanceWindow.end})`,
            operation: sql,
            suggestedFix: `Schedule operation during maintenance window or use non-blocking alternatives`,
          });
        }
      }
    }

    return violations;
  }

  /**
   * Check for operations on large tables
   */
  private checkTableSizeLimits(
    schemaDiff: SchemaDiff,
    databaseSnapshot: any,
    operationMetadata: Map<string, any>,
  ): OperationalViolation[] {
    const violations: OperationalViolation[] = [];
    const LARGE_TABLE_THRESHOLD = 1000000; // 1M rows

    for (const sql of schemaDiff.up) {
      const tableName = this.extractTableName(sql);
      if (!tableName) continue;

      // Get table metadata
      const metadata = tableName ? operationMetadata.get(tableName) : undefined;
      const estimatedRows = metadata?.estimatedRows || 0;

      if (estimatedRows > LARGE_TABLE_THRESHOLD) {
        if (this.isHighRiskOperation(sql)) {
          violations.push({
            rule: "LARGE_TABLE_HIGH_RISK_OPERATION",
            severity: "CRITICAL",
            message: `High-risk operation on large table (${tableName}) with ${estimatedRows} estimated rows`,
            operation: sql,
            suggestedFix:
              "Consider using online schema change tools or schedule during low-traffic periods",
          });
        } else if (this.isBlockingOperation(sql)) {
          violations.push({
            rule: "LARGE_TABLE_BLOCKING_OPERATION",
            severity: "WARNING",
            message: `Blocking operation on large table (${tableName}) with ${estimatedRows} estimated rows`,
            operation: sql,
            suggestedFix:
              "Schedule during maintenance window or use non-blocking alternatives",
          });
        }
      }
    }

    return violations;
  }

  /**
   * Check for blocking operations
   */
  private checkBlockingOperations(
    schemaDiff: SchemaDiff,
    operationMetadata: Map<string, any>,
  ): OperationalViolation[] {
    const violations: OperationalViolation[] = [];

    for (const sql of schemaDiff.up) {
      if (this.isBlockingOperation(sql)) {
        const tableName = this.extractTableName(sql);
        const metadata = tableName
          ? operationMetadata.get(tableName)
          : undefined;

        violations.push({
          rule: "BLOCKING_OPERATION_DETECTED",
          severity: metadata?.requiresDowntime ? "CRITICAL" : "WARNING",
          message: `Blocking operation detected: ${sql}`,
          operation: sql,
          suggestedFix: metadata?.requiresDowntime
            ? "Schedule during maintenance window with application downtime"
            : "Consider using online schema change tools",
        });
      }
    }

    return violations;
  }

  /**
   * Check for operation conflicts
   */
  private checkOperationConflicts(
    schemaDiff: SchemaDiff,
    operationMetadata: Map<string, any>,
  ): OperationalViolation[] {
    const violations: OperationalViolation[] = [];
    const operations = schemaDiff.up;

    // Check for conflicting operations in the same migration
    for (let i = 0; i < operations.length; i++) {
      for (let j = i + 1; j < operations.length; j++) {
        const op1 = operations[i];
        const op2 = operations[j];

        if (this.isConflictingOperations(op1, op2)) {
          violations.push({
            rule: "OPERATION_CONFLICT_DETECTED",
            severity: "WARNING",
            message: `Conflicting operations detected: ${op1} and ${op2}`,
            operation: `${op1} | ${op2}`,
            suggestedFix:
              "Split conflicting operations into separate migrations or reorder them",
          });
        }
      }
    }

    return violations;
  }

  /**
   * Check if operation is blocking
   */
  private isBlockingOperation(sql: string): boolean {
    const blockingPatterns = [
      /DROP\s+COLUMN/i,
      /ALTER\s+COLUMN.*DROP/i,
      /DROP\s+CONSTRAINT/i,
      /ALTER\s+TABLE.*DROP/i,
      /RENAME\s+COLUMN/i,
      /ALTER\s+COLUMN.*TYPE/i,
    ];

    return blockingPatterns.some((pattern) => pattern.test(sql));
  }

  /**
   * Check if operation is high-risk
   */
  private isHighRiskOperation(sql: string): boolean {
    const highRiskPatterns = [
      /DROP\s+TABLE/i,
      /DROP\s+COLUMN/i,
      /ALTER\s+COLUMN.*TYPE/i,
      /ALTER\s+TABLE.*DROP/i,
    ];

    return highRiskPatterns.some((pattern) => pattern.test(sql));
  }

  /**
   * Check if two operations conflict
   */
  private isConflictingOperations(op1: string, op2: string): boolean {
    const table1 = this.extractTableName(op1);
    const table2 = this.extractTableName(op2);

    if (!table1 || !table2 || table1 !== table2) {
      return false;
    }

    // Check for specific conflict patterns
    const conflicts = [
      // Adding and dropping the same column
      this.hasColumnConflict(op1, op2, "ADD", "DROP"),
      this.hasColumnConflict(op2, op1, "ADD", "DROP"),

      // Multiple operations on the same column
      this.hasSameColumnAlter(op1, op2),

      // Constraint conflicts
      /ADD\s+CONSTRAINT/i.test(op1) && /DROP\s+CONSTRAINT/i.test(op2),
      /DROP\s+CONSTRAINT/i.test(op1) && /ADD\s+CONSTRAINT/i.test(op2),
    ];

    return conflicts.some((conflict) => conflict);
  }

  /**
   * Check if operations have column conflicts (ADD vs DROP)
   */
  private hasColumnConflict(
    op1: string,
    op2: string,
    action1: string,
    action2: string,
  ): boolean {
    const addMatch = op1.match(
      new RegExp(`${action1}\\s+COLUMN.*\\b(\\w+)\\b`, "i"),
    );
    if (!addMatch) return false;

    const columnName = addMatch[1];
    const dropPattern = new RegExp(
      `${action2}\\s+COLUMN.*\\b${columnName}\\b`,
      "i",
    );
    return dropPattern.test(op2);
  }

  /**
   * Check if both operations alter the same column
   */
  private hasSameColumnAlter(op1: string, op2: string): boolean {
    const alterMatch1 = op1.match(/ALTER\s+COLUMN.*\b(\w+)\b/i);
    if (!alterMatch1) return false;

    const columnName = alterMatch1[1];
    const alterPattern = new RegExp(
      `ALTER\\s+COLUMN.*\\b${columnName}\\b`,
      "i",
    );
    return alterPattern.test(op2);
  }

  /**
   * Extract table name from SQL statement
   */
  private extractTableName(sql: string): string | null {
    // Match various table reference patterns
    const patterns = [
      /CREATE\s+TABLE\s+(\w+)/i,
      /ALTER\s+TABLE\s+(\w+)/i,
      /DROP\s+TABLE\s+(\w+)/i,
      /INSERT\s+INTO\s+(\w+)/i,
      /UPDATE\s+(\w+)/i,
      /DELETE\s+FROM\s+(\w+)/i,
      /RENAME\s+TABLE\s+(\w+)/i,
    ];

    for (const pattern of patterns) {
      const match = sql.match(pattern);
      if (match) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * Validate operational rule configuration
   */
  public validate(): OperationalValidation {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate maintenance window configuration
    if (!this.isValidMaintenanceWindow(this.defaultMaintenanceWindow)) {
      errors.push("Invalid default maintenance window configuration");
    }

    // Check for conflicting operational rules
    const conflicts = this.checkOperationalConflicts();
    if (conflicts.length > 0) {
      warnings.push(...conflicts);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Check if maintenance window is valid
   */
  private isValidMaintenanceWindow(window: MaintenanceWindow): boolean {
    try {
      const start = parseInt(window.start.split(":")[0]);
      const end = parseInt(window.end.split(":")[0]);

      return (
        start >= 0 &&
        start <= 23 &&
        end >= 0 &&
        end <= 23 &&
        start < end &&
        window.timezone.length > 0
      );
    } catch {
      return false;
    }
  }

  /**
   * Check for conflicting operational rules
   */
  private checkOperationalConflicts(): string[] {
    const conflicts: string[] = [];

    // Check for conflicting severity levels or suggestions
    // This is a placeholder for more complex conflict detection

    return conflicts;
  }

  /**
   * Get rule documentation
   */
  public getRuleDocumentation(): {
    rule: string;
    description: string;
    severity: string;
    example: string;
  }[] {
    return [
      {
        rule: "OPERATION_OUTSIDE_MAINTENANCE_WINDOW",
        description:
          "Prevents blocking operations outside configured maintenance windows",
        severity: "CRITICAL",
        example:
          "DROP COLUMN during business hours → Schedule during maintenance window",
      },
      {
        rule: "LARGE_TABLE_HIGH_RISK_OPERATION",
        description:
          "Warns about high-risk operations on tables with large row counts",
        severity: "CRITICAL",
        example:
          "ALTER COLUMN on 10M row table → Use online schema change tools",
      },
      {
        rule: "LARGE_TABLE_BLOCKING_OPERATION",
        description:
          "Warns about blocking operations on tables with large row counts",
        severity: "WARNING",
        example:
          "DROP CONSTRAINT on 5M row table → Schedule during low-traffic periods",
      },
      {
        rule: "BLOCKING_OPERATION_DETECTED",
        description: "Identifies operations that will block database access",
        severity: "WARNING",
        example:
          "ALTER TABLE with table lock → Consider non-blocking alternatives",
      },
      {
        rule: "OPERATION_CONFLICT_DETECTED",
        description:
          "Identifies conflicting operations that should be separated",
        severity: "WARNING",
        example:
          "ADD and DROP same column in one migration → Split into separate migrations",
      },
    ];
  }
}
