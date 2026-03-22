/**
 * Migration Lifecycle Engine
 * 
 * Implements the "Expand-Migrate-Contract" pattern.
 * Automatically detects dangerous operations and splits them into safe phases.
 */

import { SqlCategory, MigrationLifecycleSet, CompanionMigration } from './types';

/**
 * Migration Lifecycle Engine
 * 
 * Automatically detects dangerous operations and splits them into safe phases:
 * - Expand: Add new columns/tables/indexes (SAFE)
 * - Migrate: Backfill data (DATA) 
 * - Contract: Drop old columns/constraints (BREAKING)
 */
export class LifecycleSplitter {
  // Add a typeMap property to store column type information
  private typeMap: Map<string, Map<string, string>> = new Map();

  /**
   * Main entry point to transform raw SQL into a lifecycle set
   */
  public split(rawSql: string[], typeMap?: Map<string, Map<string, string>>): MigrationLifecycleSet {
    // Store typeMap for use in rewrite methods
    if (typeMap) this.typeMap = typeMap;
    const result: MigrationLifecycleSet = {
      safe: [],
      data: [],
      breaking: []
    };

    for (const statement of rawSql) {
      // 1. Handle NOT NULL violations
      if (this.isNotNullViolation(statement)) {
        const split = this.rewriteNotNullViolation(statement);
        result.safe.push(...split.safe);
        result.data.push(...split.data);
        result.breaking.push(...split.breaking);
        continue;
      }

      // 2. Handle Column Renames (New!)
      if (this.isColumnRename(statement)) {
        const split = this.rewriteColumnRename(statement);
        result.safe.push(...split.safe);
        result.data.push(...split.data);
        result.breaking.push(...split.breaking);
        continue;
      }

      // 3. Handle Type Changes (New!)
      if (this.isTypeChange(statement)) {
        const split = this.rewriteTypeChange(statement);
        result.safe.push(...split.safe);
        result.data.push(...split.data);
        result.breaking.push(...split.breaking);
        continue;
      }

      // 4. Standard Classification for everything else
      const classification = this.classify(statement);
      if (classification === 'SAFE') result.safe.push(statement);
      else if (classification === 'DATA') result.data.push(statement);
      else result.breaking.push(statement);
    }

    return result;
  }

  /**
   * Detects NOT NULL violations that need splitting
   */
  private isNotNullViolation(sql: string): boolean {
    return /ADD\s+COLUMN.*NOT\s+NULL/i.test(sql);
  }

  /**
   * Detects column rename operations
   */
  private isColumnRename(sql: string): boolean {
    return /RENAME\s+COLUMN/i.test(sql);
  }

  /**
   * Detects type change operations
   */
  private isTypeChange(sql: string): boolean {
    return /ALTER\s+COLUMN.*TYPE/i.test(sql);
  }

  /**
   * Splits: ALTER TABLE "t" ADD "c" type NOT NULL
   * Into:
   * SAFE: ALTER TABLE "t" ADD "c" type
   * DATA: UPDATE "t" SET "c" = 'DEFAULT' (Placeholder)
   * BREAKING: ALTER TABLE "t" ALTER COLUMN "c" SET NOT NULL
   */
  private rewriteNotNullViolation(sql: string): MigrationLifecycleSet {
    const tableMatch = sql.match(/ALTER\s+TABLE\s+"([^"]+)"/i);
    // More robust regex that captures types with spaces and arguments
    const columnMatch = sql.match(/ADD\s+"([^"]+)"\s+(.+?)(?:\s+NOT\s+NULL|$)/i);

    if (!tableMatch || !columnMatch) return { safe: [sql], data: [], breaking: [] };

    const table = tableMatch[1];
    const column = columnMatch[1];
    const type = columnMatch[2].trim();

    return {
      safe: [`ALTER TABLE "${table}" ADD "${column}" ${type}`],
      data: [`UPDATE "${table}" SET "${column}" = 'TODO_BACKFILL' WHERE "${column}" IS NULL`],
      breaking: [`ALTER TABLE "${table}" ALTER COLUMN "${column}" SET NOT NULL`]
    };
  }

  /**
   * Splits: ALTER TABLE "t" RENAME COLUMN "old" TO "new"
   * Into:
   * SAFE: ALTER TABLE "t" ADD COLUMN "new" <TYPE_PLACEHOLDER>
   * DATA: UPDATE "t" SET "new" = "old"
   * BREAKING: ALTER TABLE "t" DROP COLUMN "old"
   */
  private rewriteColumnRename(sql: string): MigrationLifecycleSet {
    const tableMatch = sql.match(/ALTER\s+TABLE\s+"([^"]+)"/i);
    const renameMatch = sql.match(/RENAME\s+COLUMN\s+"([^"]+)"\s+TO\s+"([^"]+)"/i);

    if (!tableMatch || !renameMatch) return { safe: [], data: [], breaking: [sql] };

    const table = tableMatch[1];
    const oldCol = renameMatch[1];
    const newCol = renameMatch[2];
    
    // Look up type from the database map we built
    const detectedType = this.typeMap.get(table)?.get(oldCol) || 'VARCHAR'; // Fallback type

    return {
      safe: [`ALTER TABLE "${table}" ADD COLUMN "${newCol}" ${detectedType}`],
      data: [`UPDATE "${table}" SET "${newCol}" = "${oldCol}"`],
      breaking: [`ALTER TABLE "${table}" DROP COLUMN "${oldCol}"`]
    };
  }

  /**
   * Splits: ALTER TABLE "t" ALTER COLUMN "c" TYPE new_type
   * Into:
   * SAFE: ALTER TABLE "t" ADD COLUMN "c_v2" new_type
   * DATA: UPDATE "t" SET "c_v2" = CAST("c" AS new_type)
   * BREAKING: ALTER TABLE "t" DROP COLUMN "c", RENAME COLUMN "c_v2" TO "c"
   */
  private rewriteTypeChange(sql: string): MigrationLifecycleSet {
    const tableMatch = sql.match(/ALTER\s+TABLE\s+"([^"]+)"/i);
    const typeMatch = sql.match(/ALTER\s+COLUMN\s+"([^"]+)"\s+TYPE\s+(\w+)/i);

    if (!tableMatch || !typeMatch) return { safe: [], data: [], breaking: [sql] };

    const table = tableMatch[1];
    const column = typeMatch[1];
    const newType = typeMatch[2];
    const tempColumn = `${column}_v2`;

    return {
      safe: [`ALTER TABLE "${table}" ADD COLUMN "${tempColumn}" ${newType}`],
      data: [`UPDATE "${table}" SET "${tempColumn}" = CAST("${column}" AS ${newType})`],
      breaking: [
        `ALTER TABLE "${table}" DROP COLUMN "${column}"`,
        `ALTER TABLE "${table}" RENAME COLUMN "${tempColumn}" TO "${column}"`
      ]
    };
  }

  /**
   * Standard classification for operations that don't need splitting
   */
  private classify(sql: string): 'SAFE' | 'DATA' | 'BREAKING' {
    if (/CREATE\s+TABLE|CREATE\s+INDEX|ADD\s+COLUMN/i.test(sql) && !/NOT\s+NULL/i.test(sql)) {
      return 'SAFE';
    }
    if (/UPDATE|INSERT|DELETE/i.test(sql)) {
      return 'DATA';
    }
    return 'BREAKING'; // Default to safe/conservative
  }

  /**
   * Generate companion migrations for complex operations
   */
  public generateCompanions(sql: string, tableName: string): CompanionMigration[] {
    const companions: CompanionMigration[] = [];

    if (this.isNotNullViolation(sql)) {
      const columnMatch = sql.match(/ADD\s+"([^"]+)"/i);
      if (columnMatch) {
        const column = columnMatch[1];
        companions.push(
          {
            phase: 'DATA',
            sql: `UPDATE "${tableName}" SET "${column}" = <DEFAULT_VALUE> WHERE "${column}" IS NULL`,
            reason: `Column "${column}" requires backfill before NOT NULL can be enforced`
          },
          {
            phase: 'BREAKING',
            sql: `ALTER TABLE "${tableName}" ALTER COLUMN "${column}" SET NOT NULL`,
            reason: `Enforce NOT NULL on "${column}" after data is backfilled`
          }
        );
      }
    }

    if (this.isColumnRename(sql)) {
      const renameMatch = sql.match(/RENAME\s+COLUMN\s+"([^"]+)"\s+TO\s+"([^"]+)"/i);
      if (renameMatch) {
        const oldCol = renameMatch[1];
        const newCol = renameMatch[2];
        companions.push(
          {
            phase: 'DATA',
            sql: `UPDATE "${tableName}" SET "${newCol}" = "${oldCol}"`,
            reason: `Copy data from "${oldCol}" to "${newCol}"`
          },
          {
            phase: 'BREAKING',
            sql: `ALTER TABLE "${tableName}" DROP COLUMN "${oldCol}"`,
            reason: `Remove old column "${oldCol}" after rename`
          }
        );
      }
    }

    if (this.isTypeChange(sql)) {
      const typeMatch = sql.match(/ALTER\s+COLUMN\s+"([^"]+)"\s+TYPE\s+(\w+)/i);
      if (typeMatch) {
        const column = typeMatch[1];
        const newType = typeMatch[2];
        const tempColumn = `${column}_v2`;
        companions.push(
          {
            phase: 'DATA',
            sql: `UPDATE "${tableName}" SET "${tempColumn}" = CAST("${column}" AS ${newType})`,
            reason: `Cast data from "${column}" to ${newType}`
          },
          {
            phase: 'BREAKING',
            sql: `ALTER TABLE "${tableName}" DROP COLUMN "${column}"; ALTER TABLE "${tableName}" RENAME COLUMN "${tempColumn}" TO "${column}"`,
            reason: `Remove old column and rename temp column to "${column}"`
          }
        );
      }
    }

    return companions;
  }
}