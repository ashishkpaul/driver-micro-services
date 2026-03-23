/**
 * Compatibility Rules
 *
 * Enforces backward compatibility by rejecting dangerous schema operations
 * and mandating the Expand-Migrate-Contract pattern for safe evolution.
 */

import { SchemaDiff } from "../types";

export interface CompatibilityViolation {
  rule: string;
  severity: "CRITICAL" | "WARNING" | "INFO";
  message: string;
  operation: string;
  suggestedFix?: string;
}

export interface CompatibilityValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Compatibility Rules
 *
 * Implements rules that prevent backward-incompatible schema changes
 * and enforce the Expand-Migrate-Contract pattern.
 */
export class CompatibilityRules {
  /**
   * Evaluate schema diff against compatibility rules
   */
  public evaluate(schemaDiff: SchemaDiff): CompatibilityViolation[] {
    console.log("🔍 Evaluating compatibility rules...");

    const violations: CompatibilityViolation[] = [];

    // Check for direct column renames
    const renameViolations = this.checkColumnRenames(schemaDiff);
    violations.push(...renameViolations);

    // Check for direct column type changes
    const typeChangeViolations = this.checkColumnTypeChanges(schemaDiff);
    violations.push(...typeChangeViolations);

    // Check for direct column drops
    const dropViolations = this.checkColumnDrops(schemaDiff);
    violations.push(...dropViolations);

    // Check for direct table drops
    const tableDropViolations = this.checkTableDrops(schemaDiff);
    violations.push(...tableDropViolations);

    // Check for constraint violations
    const constraintViolations = this.checkConstraintChanges(schemaDiff);
    violations.push(...constraintViolations);

    console.log(
      `📋 Compatibility check complete: ${violations.length} violations`,
    );

    return violations;
  }

  /**
   * Check for direct column rename operations
   */
  private checkColumnRenames(schemaDiff: SchemaDiff): CompatibilityViolation[] {
    const violations: CompatibilityViolation[] = [];

    for (const sql of schemaDiff.up) {
      if (this.isDirectColumnRename(sql)) {
        const match = sql.match(/RENAME\s+COLUMN\s+(\w+\.\w+)\s+TO\s+(\w+)/i);
        if (match) {
          violations.push({
            rule: "NO_DIRECT_COLUMN_RENAME",
            severity: "CRITICAL",
            message: `Direct column rename detected: ${match[1]} → ${match[2]}`,
            operation: sql,
            suggestedFix:
              "Use Expand-Migrate-Contract pattern: 1) Add new column, 2) Backfill data, 3) Update application code, 4) Drop old column",
          });
        }
      }
    }

    return violations;
  }

  /**
   * Check for direct column type changes
   */
  private checkColumnTypeChanges(
    schemaDiff: SchemaDiff,
  ): CompatibilityViolation[] {
    const violations: CompatibilityViolation[] = [];

    for (const sql of schemaDiff.up) {
      if (this.isDirectColumnTypeChange(sql)) {
        const match = sql.match(/ALTER\s+COLUMN\s+(\w+\.\w+)\s+TYPE\s+(\w+)/i);
        if (match) {
          violations.push({
            rule: "NO_DIRECT_COLUMN_TYPE_CHANGE",
            severity: "CRITICAL",
            message: `Direct column type change detected: ${match[1]} → ${match[2]}`,
            operation: sql,
            suggestedFix:
              "Use Expand-Migrate-Contract pattern: 1) Add new column with correct type, 2) Migrate data, 3) Update application code, 4) Drop old column",
          });
        }
      }
    }

    return violations;
  }

  /**
   * Check for direct column drops
   */
  private checkColumnDrops(schemaDiff: SchemaDiff): CompatibilityViolation[] {
    const violations: CompatibilityViolation[] = [];

    for (const sql of schemaDiff.up) {
      if (this.isDirectColumnDrop(sql)) {
        const match = sql.match(/DROP\s+COLUMN\s+(\w+\.\w+)/i);
        if (match) {
          violations.push({
            rule: "NO_DIRECT_COLUMN_DROP",
            severity: "CRITICAL",
            message: `Direct column drop detected: ${match[1]}`,
            operation: sql,
            suggestedFix:
              "Use Expand-Migrate-Contract pattern: 1) Ensure column is no longer referenced, 2) Drop column in separate migration",
          });
        }
      }
    }

    return violations;
  }

  /**
   * Check for direct table drops
   */
  private checkTableDrops(schemaDiff: SchemaDiff): CompatibilityViolation[] {
    const violations: CompatibilityViolation[] = [];

    for (const sql of schemaDiff.up) {
      if (this.isDirectTableDrop(sql)) {
        const match = sql.match(/DROP\s+TABLE\s+(\w+)/i);
        if (match) {
          violations.push({
            rule: "NO_DIRECT_TABLE_DROP",
            severity: "CRITICAL",
            message: `Direct table drop detected: ${match[1]}`,
            operation: sql,
            suggestedFix:
              "Use Expand-Migrate-Contract pattern: 1) Ensure table is no longer referenced, 2) Drop table in separate migration",
          });
        }
      }
    }

    return violations;
  }

  /**
   * Check for constraint changes that break compatibility
   */
  private checkConstraintChanges(
    schemaDiff: SchemaDiff,
  ): CompatibilityViolation[] {
    const violations: CompatibilityViolation[] = [];

    for (const sql of schemaDiff.up) {
      if (this.isDirectConstraintDrop(sql)) {
        const match = sql.match(/DROP\s+CONSTRAINT\s+(\w+\.\w+)/i);
        if (match) {
          violations.push({
            rule: "NO_DIRECT_CONSTRAINT_DROP",
            severity: "WARNING",
            message: `Direct constraint drop detected: ${match[1]}`,
            operation: sql,
            suggestedFix:
              "Evaluate if constraint can be safely removed. Consider data integrity implications.",
          });
        }
      } else if (this.isConstraintAddition(sql)) {
        const match = sql.match(/ADD\s+CONSTRAINT\s+(\w+\.\w+)/i);
        if (match) {
          violations.push({
            rule: "CONSTRAINT_ADDITION_RISK",
            severity: "WARNING",
            message: `Constraint addition may fail due to existing data: ${match[1]}`,
            operation: sql,
            suggestedFix:
              "Verify existing data complies with constraint before adding. Consider data migration if needed.",
          });
        }
      }
    }

    return violations;
  }

  /**
   * Check if SQL is a direct column rename
   */
  private isDirectColumnRename(sql: string): boolean {
    return /RENAME\s+COLUMN/i.test(sql) && !/ADD\s+COLUMN/i.test(sql);
  }

  /**
   * Check if SQL is a direct column type change
   */
  private isDirectColumnTypeChange(sql: string): boolean {
    return /ALTER\s+COLUMN.*TYPE/i.test(sql) && !/ADD\s+COLUMN/i.test(sql);
  }

  /**
   * Check if SQL is a direct column drop
   */
  private isDirectColumnDrop(sql: string): boolean {
    return /DROP\s+COLUMN/i.test(sql) && !/ADD\s+COLUMN/i.test(sql);
  }

  /**
   * Check if SQL is a direct table drop
   */
  private isDirectTableDrop(sql: string): boolean {
    return /DROP\s+TABLE/i.test(sql) && !/CREATE\s+TABLE/i.test(sql);
  }

  /**
   * Check if SQL is a direct constraint drop
   */
  private isDirectConstraintDrop(sql: string): boolean {
    return /DROP\s+CONSTRAINT/i.test(sql);
  }

  /**
   * Check if SQL is a constraint addition
   */
  private isConstraintAddition(sql: string): boolean {
    return /ADD\s+CONSTRAINT/i.test(sql);
  }

  /**
   * Validate compatibility rule configuration
   */
  public validate(): CompatibilityValidation {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Validate rule configuration
    if (!this.isValid()) {
      errors.push("Compatibility rules configuration is invalid");
    }

    // Check for conflicting rules
    const conflicts = this.checkRuleConflicts();
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
   * Check if rules are properly configured
   */
  private isValid(): boolean {
    // Basic validation - rules should be properly defined
    return true;
  }

  /**
   * Check for conflicting rule definitions
   */
  private checkRuleConflicts(): string[] {
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
        rule: "NO_DIRECT_COLUMN_RENAME",
        description:
          "Prevents direct column renames which break backward compatibility",
        severity: "CRITICAL",
        example:
          "RENAME COLUMN users.email TO contact_email → Use Expand-Migrate-Contract",
      },
      {
        rule: "NO_DIRECT_COLUMN_TYPE_CHANGE",
        description:
          "Prevents direct column type changes which can cause data loss",
        severity: "CRITICAL",
        example:
          "ALTER COLUMN users.age TYPE VARCHAR → Use Expand-Migrate-Contract",
      },
      {
        rule: "NO_DIRECT_COLUMN_DROP",
        description: "Prevents direct column drops which break existing code",
        severity: "CRITICAL",
        example: "DROP COLUMN users.old_field → Use Expand-Migrate-Contract",
      },
      {
        rule: "NO_DIRECT_TABLE_DROP",
        description: "Prevents direct table drops which break existing code",
        severity: "CRITICAL",
        example: "DROP TABLE old_table → Use Expand-Migrate-Contract",
      },
      {
        rule: "NO_DIRECT_CONSTRAINT_DROP",
        description:
          "Warns about constraint drops that may affect data integrity",
        severity: "WARNING",
        example: "DROP CONSTRAINT users.email_unique → Evaluate data integrity",
      },
      {
        rule: "CONSTRAINT_ADDITION_RISK",
        description:
          "Warns about constraint additions that may fail due to existing data",
        severity: "WARNING",
        example:
          "ADD CONSTRAINT users.age_positive → Verify existing data compliance",
      },
    ];
  }
}
