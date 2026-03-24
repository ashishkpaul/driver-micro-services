import { Injectable, Logger } from "@nestjs/common";
import { ClassifiedStatement, SqlCategory } from "../engine/types";

interface StatementClassification {
  type: 'BREAKING' | 'DATA' | 'SAFE' | 'FIX';
  riskLevel: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  requiresReview: boolean;
}

@Injectable()
export class SchemaClassificationService {
  private readonly logger = new Logger(SchemaClassificationService.name);

  /**
   * Classify a single SQL statement
   */
  private classifyStatement(statement: string): StatementClassification {
    const upperStatement = statement.toUpperCase().trim();

    // Check for breaking changes
    if (this.isBreakingChange(upperStatement)) {
      return {
        type: 'BREAKING',
        riskLevel: this.getBreakingRiskLevel(upperStatement),
        description: this.getBreakingDescription(upperStatement),
        requiresReview: true,
      };
    }

    // Check for data operations
    if (this.isDataOperation(upperStatement)) {
      return {
        type: 'DATA',
        riskLevel: this.getDataRiskLevel(upperStatement),
        description: this.getDataDescription(upperStatement),
        requiresReview: true,
      };
    }

    // Check for fix operations
    if (this.isFixOperation(upperStatement)) {
      return {
        type: 'FIX',
        riskLevel: 'low',
        description: 'Schema fix operation',
        requiresReview: false,
      };
    }

    // Default to safe
    return {
      type: 'SAFE',
      riskLevel: 'low',
      description: 'Safe schema operation',
      requiresReview: false,
    };
  }

  /**
   * Classify multiple changes (for compatibility analysis)
   */
  async classifyChanges(changes: string[]): Promise<any[]> {
    this.logger.log(`Classifying ${changes.length} changes...`);

    const classifiedChanges = changes.map((change, index) => {
      const classification = this.classifyStatement(change);
      return {
        id: index,
        type: classification.type,
        operation: this.extractOperation(change),
        target: this.extractTarget(change),
        classification: classification.type,
        description: classification.description,
        riskLevel: classification.riskLevel,
        requiresReview: classification.requiresReview,
      };
    });

    this.logger.log(`✅ Classified ${classifiedChanges.length} changes`);
    return classifiedChanges;
  }

  /**
   * Extract operation type from SQL statement
   */
  private extractOperation(statement: string): string {
    const upperStatement = statement.toUpperCase().trim();
    
    if (upperStatement.startsWith('CREATE TABLE')) return 'CREATE_TABLE';
    if (upperStatement.startsWith('DROP TABLE')) return 'DROP_TABLE';
    if (upperStatement.startsWith('ALTER TABLE')) {
      if (upperStatement.includes('ADD COLUMN')) return 'ADD_COLUMN';
      if (upperStatement.includes('DROP COLUMN')) return 'DROP_COLUMN';
      if (upperStatement.includes('ALTER COLUMN')) return 'ALTER_COLUMN_TYPE';
      if (upperStatement.includes('ADD CONSTRAINT')) return 'ADD_CONSTRAINT';
      if (upperStatement.includes('DROP CONSTRAINT')) return 'DROP_CONSTRAINT';
      return 'ALTER_TABLE';
    }
    if (upperStatement.startsWith('CREATE INDEX')) return 'ADD_INDEX';
    if (upperStatement.startsWith('DROP INDEX')) return 'DROP_INDEX';
    if (upperStatement.startsWith('INSERT INTO')) return 'INSERT_DATA';
    if (upperStatement.startsWith('UPDATE')) return 'UPDATE_DATA';
    if (upperStatement.startsWith('DELETE FROM')) return 'DELETE_DATA';
    if (upperStatement.startsWith('TRUNCATE')) return 'TRUNCATE_TABLE';
    
    return 'UNKNOWN';
  }

  /**
   * Extract target information from SQL statement
   */
  private extractTarget(statement: string): any {
    const upperStatement = statement.toUpperCase().trim();
    const target: any = {};

    // Extract table name
    const tableMatch = upperStatement.match(/(?:TABLE|INDEX|CONSTRAINT)\s+`?(\w+)`?/i);
    if (tableMatch) {
      target.table = tableMatch[1];
    }

    // Extract column name
    const columnMatch = upperStatement.match(/(?:COLUMN|ADD|DROP)\s+`?(\w+)`?/i);
    if (columnMatch) {
      target.column = columnMatch[1];
    }

    // Extract index name
    const indexMatch = upperStatement.match(/INDEX\s+`?(\w+)`?/i);
    if (indexMatch) {
      target.index = indexMatch[1];
    }

    // Extract constraint name
    const constraintMatch = upperStatement.match(/CONSTRAINT\s+`?(\w+)`?/i);
    if (constraintMatch) {
      target.foreignKey = constraintMatch[1];
    }

    // Extract multiple columns for indexes
    const columnsMatch = upperStatement.match(/\(([^)]+)\)/);
    if (columnsMatch) {
      target.columns = columnsMatch[1]
        .split(',')
        .map(col => col.trim().replace(/`/g, ''))
        .filter(col => col.length > 0);
    }

    return target;
  }

  /**
   * Check if statement is a breaking change
   */
  private isBreakingChange(statement: string): boolean {
    const breakingPatterns = [
      /DROP\s+TABLE/i,
      /DROP\s+COLUMN/i,
      /ALTER\s+COLUMN.*TYPE/i,
      /DROP\s+INDEX/i,
      /DROP\s+CONSTRAINT/i,
      /TRUNCATE/i,
    ];

    return breakingPatterns.some(pattern => pattern.test(statement));
  }

  /**
   * Check if statement is a data operation
   */
  private isDataOperation(statement: string): boolean {
    const dataPatterns = [
      /INSERT\s+INTO/i,
      /UPDATE\s+/i,
      /DELETE\s+FROM/i,
      /COPY\s+/i,
    ];

    return dataPatterns.some(pattern => pattern.test(statement));
  }

  /**
   * Check if statement is a fix operation
   */
  private isFixOperation(statement: string): boolean {
    const fixPatterns = [
      /COMMENT\s+ON/i,
      /GRANT\s+/i,
      /REVOKE\s+/i,
    ];

    return fixPatterns.some(pattern => pattern.test(statement));
  }

  /**
   * Get breaking change risk level
   */
  private getBreakingRiskLevel(statement: string): 'critical' | 'high' | 'medium' | 'low' {
    if (/DROP\s+TABLE/i.test(statement)) return 'critical';
    if (/DROP\s+COLUMN/i.test(statement)) return 'high';
    if (/ALTER\s+COLUMN.*TYPE/i.test(statement)) return 'high';
    if (/DROP\s+INDEX/i.test(statement)) return 'medium';
    return 'medium';
  }

  /**
   * Get breaking change description
   */
  private getBreakingDescription(statement: string): string {
    if (/DROP\s+TABLE/i.test(statement)) return 'Table deletion - will result in complete data loss';
    if (/DROP\s+COLUMN/i.test(statement)) return 'Column deletion - will result in data loss';
    if (/ALTER\s+COLUMN.*TYPE/i.test(statement)) return 'Column type change - may cause data conversion issues';
    if (/DROP\s+INDEX/i.test(statement)) return 'Index deletion - will impact query performance';
    return 'Breaking schema change';
  }

  /**
   * Get data operation risk level
   */
  private getDataRiskLevel(statement: string): 'critical' | 'high' | 'medium' | 'low' {
    if (/DELETE\s+FROM/i.test(statement)) return 'high';
    if (/UPDATE\s+/i.test(statement)) return 'medium';
    if (/INSERT\s+INTO/i.test(statement)) return 'low';
    return 'medium';
  }

  /**
   * Get data operation description
   */
  private getDataDescription(statement: string): string {
    if (/DELETE\s+FROM/i.test(statement)) return 'Data deletion operation';
    if (/UPDATE\s+/i.test(statement)) return 'Data update operation';
    if (/INSERT\s+INTO/i.test(statement)) return 'Data insertion operation';
    if (/COPY\s+/i.test(statement)) return 'Bulk data copy operation';
    return 'Data manipulation operation';
  }

  /**
   * Classify operations (for schema orchestrator)
   */
  async classifyOperations(sqlStatements: string[]): Promise<ClassifiedStatement[]> {
    this.logger.log(`Classifying ${sqlStatements.length} SQL statements...`);

    const classified: ClassifiedStatement[] = sqlStatements.map(sql => {
      const upperSql = sql.toUpperCase().trim();

      // BREAKING — destructive
      if (/\bDROP\s+TABLE\b/i.test(upperSql)) {
        return { sql, category: "BREAKING", reason: "Table deletion" };
      }
      if (/\bDROP\s+COLUMN\b/i.test(upperSql)) {
        return { sql, category: "BREAKING", reason: "Column deletion" };
      }
      if (/\bALTER\s+COLUMN\b.*TYPE\b/i.test(upperSql)) {
        return { sql, category: "BREAKING", reason: "Changing column type can corrupt data" };
      }

      // DATA — mutations
      if (/^\s*UPDATE\s+\w/im.test(upperSql)) {
        return { sql, category: "DATA", reason: "Data update / backfill" };
      }
      if (/^\s*INSERT\s+INTO\b/im.test(upperSql)) {
        return { sql, category: "DATA", reason: "Data insert / backfill" };
      }
      if (/^\s*DELETE\s+FROM\b/im.test(upperSql)) {
        return { sql, category: "DATA", reason: "Data deletion" };
      }
      if (/^\s*COPY\s+\w/im.test(upperSql)) {
        return { sql, category: "DATA", reason: "Bulk data copy" };
      }

      // SAFE — expansions
      if (/\bCREATE\s+TABLE\b/i.test(upperSql)) {
        return { sql, category: "SAFE", reason: "New table (additive)" };
      }
      if (/\bCREATE\s+INDEX\b/i.test(upperSql)) {
        return { sql, category: "SAFE", reason: "New index (additive)" };
      }
      if (/\bCREATE\s+TYPE\b/i.test(upperSql)) {
        return { sql, category: "SAFE", reason: "New enum/type (additive)" };
      }
      if (/\bADD\s+COLUMN\b/i.test(upperSql)) {
        return { sql, category: "SAFE", reason: "New column (must be nullable)" };
      }
      if (/\bADD\s+CONSTRAINT\b/i.test(upperSql)) {
        return { sql, category: "SAFE", reason: "New constraint (check data first)" };
      }
      if (/\bCREATE\s+SEQUENCE\b/i.test(upperSql)) {
        return { sql, category: "SAFE", reason: "New sequence (additive)" };
      }

      // Default to SAFE for unrecognized statements
      return { sql, category: "SAFE", reason: "Unrecognised statement — defaulting to SAFE" };
    });

    this.logger.log(`✅ Classified ${classified.length} statements`);
    return classified;
  }

  /**
   * Get category counts for logging
   */
  private getCategoryCounts(classified: ClassifiedStatement[]): Record<SqlCategory, number> {
    return classified.reduce((acc, stmt) => {
      acc[stmt.category] = (acc[stmt.category] || 0) + 1;
      return acc;
    }, {} as Record<SqlCategory, number>);
  }

  /**
   * Get dominant category for migration prefix
   */
  getDominantCategory(classified: ClassifiedStatement[]): SqlCategory {
    const counts = this.getCategoryCounts(classified);
    
    // Priority: BREAKING > DATA > SAFE > FIX
    if (counts.BREAKING > 0) return "BREAKING";
    if (counts.DATA > 0) return "DATA";
    if (counts.SAFE > 0) return "SAFE";
    return "FIX";
  }

  /**
   * Check if migration needs phase decomposition
   */
  needsPhaseDecomposition(classified: ClassifiedStatement[]): boolean {
    const categories = new Set(classified.map(s => s.category));
    return categories.has("BREAKING") && (categories.has("SAFE") || categories.has("DATA"));
  }
}