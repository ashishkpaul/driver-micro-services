import { Injectable, Logger } from "@nestjs/common";
import { ClassifiedStatement, SqlCategory } from "../engine/types";

@Injectable()
export class SchemaClassificationService {
  private readonly logger = new Logger(SchemaClassificationService.name);

  /**
   * Classify SQL operations by risk and type
   */
  classifyOperations(sqlStatements: string[]): ClassifiedStatement[] {
    this.logger.log(`Classifying ${sqlStatements.length} SQL statements...`);

    const classified: ClassifiedStatement[] = sqlStatements.map(sql => 
      this.classifySqlStatement(sql.trim())
    );

    const categoryCounts = this.getCategoryCounts(classified);
    this.logger.log(
      `Classification complete: ${categoryCounts.SAFE} SAFE, ${categoryCounts.DATA} DATA, ${categoryCounts.BREAKING} BREAKING, ${categoryCounts.FIX} FIX`
    );

    return classified;
  }

  /**
   * Classify individual SQL statement
   */
  private classifySqlStatement(sql: string): ClassifiedStatement {
    // BREAKING — always check first (most restrictive)
    if (/\bDROP\s+TABLE\b/i.test(sql)) {
      return { sql, category: "BREAKING", reason: "DROP TABLE removes data permanently" };
    }
    if (/\bDROP\s+COLUMN\b/i.test(sql)) {
      return { sql, category: "BREAKING", reason: "DROP COLUMN removes data permanently" };
    }
    if (/\bDROP\s+TYPE\b/i.test(sql)) {
      return { sql, category: "BREAKING", reason: "DROP TYPE is destructive" };
    }
    if (/\bALTER\s+TYPE\b/i.test(sql)) {
      return { sql, category: "BREAKING", reason: "ALTER TYPE can cause table rewrites" };
    }
    if (/SET\s+NOT\s+NULL/i.test(sql)) {
      return { sql, category: "BREAKING", reason: "SET NOT NULL enforces constraint (needs data prep first)" };
    }
    if (/\bRENAME\s+COLUMN\b/i.test(sql)) {
      return { sql, category: "BREAKING", reason: "RENAME COLUMN breaks existing queries" };
    }
    if (/\bRENAME\s+TABLE\b/i.test(sql)) {
      return { sql, category: "BREAKING", reason: "RENAME TABLE breaks existing queries" };
    }
    if (/\bALTER\s+COLUMN\b.*TYPE\b/i.test(sql)) {
      return { sql, category: "BREAKING", reason: "Changing column type can corrupt data" };
    }

    // DATA — mutations
    if (/^\s*UPDATE\s+\w/im.test(sql)) {
      return { sql, category: "DATA", reason: "Data update / backfill" };
    }
    if (/^\s*INSERT\s+INTO\b/im.test(sql)) {
      return { sql, category: "DATA", reason: "Data insert / backfill" };
    }
    if (/^\s*DELETE\s+FROM\b/im.test(sql)) {
      return { sql, category: "DATA", reason: "Data deletion" };
    }
    if (/^\s*COPY\s+\w/im.test(sql)) {
      return { sql, category: "DATA", reason: "Bulk data copy" };
    }

    // SAFE — expansions
    if (/\bCREATE\s+TABLE\b/i.test(sql)) {
      return { sql, category: "SAFE", reason: "New table (additive)" };
    }
    if (/\bCREATE\s+INDEX\b/i.test(sql)) {
      return { sql, category: "SAFE", reason: "New index (additive)" };
    }
    if (/\bCREATE\s+TYPE\b/i.test(sql)) {
      return { sql, category: "SAFE", reason: "New enum/type (additive)" };
    }
    if (/\bADD\s+COLUMN\b/i.test(sql)) {
      return { sql, category: "SAFE", reason: "New column (must be nullable)" };
    }
    if (/\bADD\s+CONSTRAINT\b/i.test(sql)) {
      return { sql, category: "SAFE", reason: "New constraint (check data first)" };
    }
    if (/\bCREATE\s+SEQUENCE\b/i.test(sql)) {
      return { sql, category: "SAFE", reason: "New sequence (additive)" };
    }

    // Default to SAFE for unrecognized statements
    return { sql, category: "SAFE", reason: "Unrecognised statement — defaulting to SAFE" };
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