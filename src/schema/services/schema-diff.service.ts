import { Injectable, Logger } from "@nestjs/common";
import { DataSource } from "typeorm";
import { SchemaDiff } from "../engine/types";

export interface SchemaDifference {
  table: string;
  column?: string;
  index?: string;
  constraint?: string;
  entity: {
    type?: string;
    nullable?: boolean;
    default?: any;
    primaryKey?: boolean;
    unique?: boolean;
  };
  database: {
    type?: string;
    nullable?: boolean;
    default?: any;
    primaryKey?: boolean;
    unique?: boolean;
  };
  severity: "LOW" | "MEDIUM" | "HIGH";
  description: string;
}

type ColumnDifference = Omit<SchemaDifference, 'table' | 'column'>;

export interface DetailedSchemaDiff {
  differences: SchemaDifference[];
  newTables: string[];
  droppedTables: string[];
  alteredTables: string[];
  summary: {
    totalDifferences: number;
    criticalDifferences: number;
    mediumDifferences: number;
    lowDifferences: number;
  };
}

@Injectable()
export class SchemaDiffService {
  private readonly logger = new Logger(SchemaDiffService.name);

  constructor(private readonly dataSource: DataSource) {}

  /**
   * Detect schema differences between entity definitions and database with detailed explanations
   */
  async detectSchemaDiff(): Promise<SchemaDiff> {
    this.logger.log("Detecting schema differences...");

    try {
      // Use TypeORM's schema synchronization to detect differences
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();

      try {
        // Get current database schema - filter to only public schema
        const currentTables = await queryRunner.getTables();
        const publicTables = currentTables.filter(t => {
          // Filter out system schemas
          return !t.name.startsWith('pg_') && 
                 !t.name.startsWith('information_') && 
                 !t.name.startsWith('sql_') &&
                 t.name !== '_migrations' &&
                 t.name !== '_migrations_lock';
        });
        
        const currentTableNames = new Set(publicTables.map(t => t.name));

        // Get entity metadata
        const entityMetadatas = this.dataSource.entityMetadatas;
        
        // Normalize entity table names to snake_case for comparison
        const normalizedEntityTableNames = new Set(
          entityMetadatas.map(m => this.normalizeTableName(m.tableName))
        );

        // Find new tables (in entities but not in database)
        const newTables = entityMetadatas.filter(m => {
          const normalizedTableName = this.normalizeTableName(m.tableName);
          return !currentTableNames.has(normalizedTableName);
        });
        
        // Find dropped tables (in database but not in entities)
        const droppedTables = publicTables.filter(t => {
          const normalizedTableName = this.normalizeTableName(t.name);
          return !normalizedEntityTableNames.has(normalizedTableName);
        });

        // For now, we'll return a basic structure
        // In a real implementation, this would use TypeORM's schema builder
        // to generate the actual SQL differences
        const up: string[] = [];
        const down: string[] = [];

        // Add new tables
        newTables.forEach(metadata => {
          up.push(`-- CREATE TABLE ${metadata.tableName}`);
          down.push(`-- DROP TABLE ${metadata.tableName}`);
        });

        // Add dropped tables
        droppedTables.forEach(table => {
          up.push(`-- DROP TABLE ${table.name}`);
          down.push(`-- CREATE TABLE ${table.name}`);
        });

        const diff: SchemaDiff = {
          up,
          down,
          newTables: newTables.map(m => m.tableName),
          droppedTables: droppedTables.map(t => t.name),
          alteredTables: [], // Would be populated with actual column/index changes
        };

        this.logger.log(
          `Schema diff detected: ${newTables.length} new tables, ${droppedTables.length} dropped tables`,
        );

        return diff;
      } finally {
        await queryRunner.release();
      }
    } catch (error) {
      this.logger.error("Failed to detect schema differences", error);
      throw error;
    }
  }

  /**
   * Get detailed schema differences with explanations
   */
  async getDetailedSchemaDiff(): Promise<DetailedSchemaDiff> {
    this.logger.log("Generating detailed schema diff report...");

    try {
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();

      try {
        // Get database schema details
        const dbSchema = await this.getDatabaseSchemaDetails(queryRunner);
        
        // Get entity schema details
        const entitySchema = await this.getEntitySchemaDetails();
        
        // Compare and generate differences
        const differences = this.compareSchemas(dbSchema, entitySchema);
        
        // Generate summary
        const summary = this.generateSummary(differences);

        const detailedDiff: DetailedSchemaDiff = {
          differences,
          newTables: this.getNewTables(dbSchema, entitySchema),
          droppedTables: this.getDroppedTables(dbSchema, entitySchema),
          alteredTables: this.getAlteredTables(differences),
          summary,
        };

        this.logger.log(
          `Detailed schema diff generated: ${summary.totalDifferences} differences found`
        );

        return detailedDiff;

      } finally {
        await queryRunner.release();
      }
    } catch (error) {
      this.logger.error("Failed to generate detailed schema diff", error);
      throw error;
    }
  }

  /**
   * Get database schema details
   */
  private async getDatabaseSchemaDetails(queryRunner: any): Promise<any> {
    const tables: any = {};

    // Get table information
    const currentTables = await queryRunner.getTables();
    const publicTables = currentTables.filter(t => {
      return !t.name.startsWith('pg_') && 
             !t.name.startsWith('information_') && 
             !t.name.startsWith('sql_') &&
             t.name !== '_migrations' &&
             t.name !== '_migrations_lock';
    });

    for (const table of publicTables) {
      const tableName = this.normalizeTableName(table.name);
      
      // Get column details
      const columns = await queryRunner.query(`
        SELECT 
          column_name as name,
          data_type as type,
          is_nullable = 'YES' as nullable,
          column_default as default,
          column_name IN (
            SELECT column_name 
            FROM information_schema.key_column_usage 
            WHERE table_name = $1 AND constraint_name IN (
              SELECT constraint_name 
              FROM information_schema.table_constraints 
              WHERE table_name = $1 AND constraint_type = 'PRIMARY KEY'
            )
          ) as primary_key,
          false as unique
        FROM information_schema.columns 
        WHERE table_name = $1
        AND table_schema = 'public'
      `, [table.name]);

      // Get index details
      const indexes = await queryRunner.query(`
        SELECT 
          indexname as name,
          indexdef as definition
        FROM pg_indexes 
        WHERE tablename = $1
      `, [table.name]);

      // Get constraint details
      const constraints = await queryRunner.query(`
        SELECT 
          constraint_name as name,
          constraint_type as type,
          pg_get_constraintdef(c.oid) as definition
        FROM information_schema.table_constraints tc
        JOIN pg_constraint c ON tc.constraint_name = c.conname
        WHERE tc.table_name = $1
      `, [table.name]);

      tables[tableName] = {
        name: tableName,
        columns: columns.reduce((acc: any, col: any) => {
          acc[col.name] = {
            name: col.name,
            type: col.type,
            nullable: col.nullable,
            default: col.default,
            primaryKey: col.primary_key,
            unique: col.unique,
          };
          return acc;
        }, {}),
        indexes: indexes.reduce((acc: any, idx: any) => {
          acc[idx.name] = {
            name: idx.name,
            definition: idx.definition,
          };
          return acc;
        }, {}),
        constraints: constraints.reduce((acc: any, con: any) => {
          acc[con.name] = {
            name: con.name,
            type: con.type,
            definition: con.definition,
          };
          return acc;
        }, {}),
      };
    }

    return tables;
  }

  /**
   * Get entity schema details
   */
  private async getEntitySchemaDetails(): Promise<any> {
    const tables: any = {};
    const entityMetadatas = this.dataSource.entityMetadatas;

    for (const metadata of entityMetadatas) {
      const tableName = this.normalizeTableName(metadata.tableName);
      
      const columns: any = {};
      for (const column of metadata.columns) {
        columns[column.databaseName] = {
          name: column.databaseName,
          type: this.normalizeEntityType(column.type),
          nullable: column.isNullable,
          default: column.default as string,
          primaryKey: column.isPrimary,
          unique: false, // TypeORM ColumnMetadata doesn't have isUnique property
        };
      }

      tables[tableName] = {
        name: tableName,
        columns,
        indexes: {},
        constraints: {},
      };
    }

    return tables;
  }

  /**
   * Normalize entity column type to string representation
   */
  private normalizeEntityType(type: any): string {
    if (typeof type === "function") {
      switch (type.name) {
        case "String": return "varchar";
        case "Number": return "integer";
        case "Date": return "timestamp";
        case "Boolean": return "boolean";
        default: return type.name.toLowerCase();
      }
    }
    return String(type);
  }

  /**
   * Compare database and entity schemas
   */
  private compareSchemas(dbSchema: any, entitySchema: any): SchemaDifference[] {
    const differences: SchemaDifference[] = [];

    // Check tables that exist in entities but not in database
    for (const [entityTableName, entityTable] of Object.entries(entitySchema as Record<string, any>)) {
      if (!dbSchema[entityTableName]) {
        differences.push({
          table: entityTableName,
          severity: "HIGH",
          description: `Table '${entityTableName}' exists in entities but not in database`,
          entity: {},
          database: {},
        });
        continue;
      }

      const dbTable = dbSchema[entityTableName];

      // Compare columns
      for (const [entityColumnName, entityColumn] of Object.entries(entityTable.columns as Record<string, any>)) {
        if (!dbTable.columns[entityColumnName]) {
          differences.push({
            table: entityTableName,
            column: entityColumnName,
            severity: "HIGH",
            description: `Column '${entityColumnName}' exists in entity but not in database table '${entityTableName}'`,
            entity: {
              type: entityColumn.type,
              nullable: entityColumn.nullable,
              default: entityColumn.default,
              primaryKey: entityColumn.primaryKey,
              unique: entityColumn.unique,
            },
            database: {},
          });
          continue;
        }

        const dbColumn = dbTable.columns[entityColumnName];
        const columnDifferences = this.compareColumns(entityColumn, dbColumn);

        if (columnDifferences.length > 0) {
          differences.push(...columnDifferences.map(diff => ({
            ...diff,
            table: entityTableName,
            column: entityColumnName,
          })));
        }
      }

      // Check columns that exist in database but not in entities
      for (const [dbColumnName, dbColumn] of Object.entries(dbTable.columns as Record<string, any>)) {
        if (!entityTable.columns[dbColumnName]) {
          differences.push({
            table: entityTableName,
            column: dbColumnName,
            severity: "MEDIUM",
            description: `Column '${dbColumnName}' exists in database but not in entity table '${entityTableName}'`,
            entity: {},
            database: {
              type: dbColumn.type,
              nullable: dbColumn.nullable,
              default: dbColumn.default,
              primaryKey: dbColumn.primaryKey,
              unique: dbColumn.unique,
            },
          });
        }
      }
    }

    // Check tables that exist in database but not in entities
    for (const [dbTableName, dbTable] of Object.entries(dbSchema)) {
      if (!entitySchema[dbTableName]) {
        differences.push({
          table: dbTableName,
          severity: "MEDIUM",
          description: `Table '${dbTableName}' exists in database but not in entities`,
          entity: {},
          database: {},
        });
      }
    }

    return differences;
  }

  /**
   * Compare individual columns
   */
  private compareColumns(entityColumn: any, dbColumn: any): ColumnDifference[] {
    const differences: ColumnDifference[] = [];

    // Type comparison
    const entityType = this.normalizeDbType(this.normalizeEntityType(entityColumn.type));
    const dbType = this.normalizeDbType(dbColumn.type);
    if (entityType !== dbType) {
      differences.push({
        severity: "HIGH",
        description: `Type mismatch: entity has '${entityType}', database has '${dbType}'`,
        entity: { type: entityType },
        database: { type: dbType },
      });
    }

    // Nullable comparison
    if (entityColumn.nullable !== dbColumn.nullable) {
      differences.push({
        severity: "MEDIUM",
        description: `Nullable mismatch: entity is ${entityColumn.nullable ? 'nullable' : 'NOT NULL'}, database is ${dbColumn.nullable ? 'nullable' : 'NOT NULL'}`,
        entity: { nullable: entityColumn.nullable },
        database: { nullable: dbColumn.nullable },
      });
    }

    // Default value comparison
    const entityDefault = this.normalizeDefault(entityColumn.default);
    const dbDefault = this.normalizeDefault(dbColumn.default);
    
    // Skip comparison if entity has no default but DB has safe defaults
    if (entityDefault !== dbDefault && entityDefault !== undefined) {
      differences.push({
        severity: "MEDIUM",
        description: `Default value mismatch: entity has '${entityDefault}', database has '${dbDefault}'`,
        entity: { default: entityDefault },
        database: { default: dbDefault },
      });
    }

    // Primary key comparison
    if (entityColumn.primaryKey !== dbColumn.primaryKey) {
      differences.push({
        severity: "HIGH",
        description: `Primary key mismatch: entity is ${entityColumn.primaryKey ? 'PRIMARY KEY' : 'NOT PRIMARY KEY'}, database is ${dbColumn.primaryKey ? 'PRIMARY KEY' : 'NOT PRIMARY KEY'}`,
        entity: { primaryKey: entityColumn.primaryKey },
        database: { primaryKey: dbColumn.primaryKey },
      });
    }

    // Unique constraint comparison
    if (entityColumn.unique !== dbColumn.unique) {
      differences.push({
        severity: "MEDIUM",
        description: `Unique constraint mismatch: entity is ${entityColumn.unique ? 'UNIQUE' : 'NOT UNIQUE'}, database is ${dbColumn.unique ? 'UNIQUE' : 'NOT UNIQUE'}`,
        entity: { unique: entityColumn.unique },
        database: { unique: dbColumn.unique },
      });
    }

    return differences;
  }

  /**
   * Normalize database column type
   */
  private normalizeDbType(type: string): string {
    const typeMap: Record<string, string> = {
      "character varying": "varchar",
      "varchar": "varchar",
      "timestamp without time zone": "timestamp",
      "timestamp": "timestamp",
      "integer": "int",
      "int4": "int",
      "bigint": "bigint",
      "int8": "bigint",
      "numeric": "decimal",
      "decimal": "decimal",
      "boolean": "boolean",
      "uuid": "uuid",
      "jsonb": "jsonb",
      "USER-DEFINED": "enum",
    };

    return typeMap[type] || type;
  }

  /**
   * Normalize default value for comparison
   */
  private normalizeDefault(value: any): string | undefined {
    if (!value) return undefined;

    let v = String(value);

    // Handle TypeORM function defaults
    if (v.includes("createDateDefault") || v.includes("updateDateDefault")) {
      return "now";
    }

    // Handle JSON object defaults
    if (v === "[object Object]") {
      v = "{}";
    }

    return v
      .replace(/::[\w\s]+/g, '')
      .replace(/[()]/g, '')
      .replace(/'/g, '')
      .trim();
  }

  /**
   * Generate summary of differences
   */
  private generateSummary(differences: SchemaDifference[]): any {
    const summary = {
      totalDifferences: differences.length,
      criticalDifferences: 0,
      mediumDifferences: 0,
      lowDifferences: 0,
    };

    for (const diff of differences) {
      switch (diff.severity) {
        case "HIGH":
          summary.criticalDifferences++;
          break;
        case "MEDIUM":
          summary.mediumDifferences++;
          break;
        case "LOW":
          summary.lowDifferences++;
          break;
      }
    }

    return summary;
  }

  /**
   * Get new tables (in entities but not in database)
   */
  private getNewTables(dbSchema: any, entitySchema: any): string[] {
    return Object.keys(entitySchema).filter(tableName => !dbSchema[tableName]);
  }

  /**
   * Get dropped tables (in database but not in entities)
   */
  private getDroppedTables(dbSchema: any, entitySchema: any): string[] {
    return Object.keys(dbSchema).filter(tableName => !entitySchema[tableName]);
  }

  /**
   * Get altered tables (tables with differences)
   */
  private getAlteredTables(differences: SchemaDifference[]): string[] {
    const alteredTables = new Set<string>();
    for (const diff of differences) {
      if (diff.table) {
        alteredTables.add(diff.table);
      }
    }
    return Array.from(alteredTables);
  }

  /**
   * Normalize table name from camelCase to snake_case for database comparison
   */
  private normalizeTableName(tableName: string): string {
    // Convert camelCase to snake_case
    return tableName
      .replace(/([a-z])([A-Z])/g, '$1_$2')
      .toLowerCase();
  }

  /**
   * Log detailed schema diff report
   */
  async logDetailedDiffReport(): Promise<void> {
    try {
      const detailedDiff = await this.getDetailedSchemaDiff();
      
      this.logger.log("SCHEMA DRIFT REPORT:");
      this.logger.log("===================");
      
      if (detailedDiff.summary.totalDifferences === 0) {
        this.logger.log("✅ No schema differences detected");
        return;
      }

      this.logger.log(`Total differences: ${detailedDiff.summary.totalDifferences}`);
      this.logger.log(`Critical: ${detailedDiff.summary.criticalDifferences}`);
      this.logger.log(`Medium: ${detailedDiff.summary.mediumDifferences}`);
      this.logger.log(`Low: ${detailedDiff.summary.lowDifferences}`);
      
      this.logger.log("\nNEW TABLES:");
      for (const table of detailedDiff.newTables) {
        this.logger.log(`  + ${table}`);
      }
      
      this.logger.log("\nDROPPED TABLES:");
      for (const table of detailedDiff.droppedTables) {
        this.logger.log(`  - ${table}`);
      }
      
      this.logger.log("\nALTERED TABLES:");
      for (const table of detailedDiff.alteredTables) {
        this.logger.log(`  ~ ${table}`);
      }
      
      this.logger.log("\nDETAILED DIFFERENCES:");
      for (const diff of detailedDiff.differences) {
        const severityIcon = diff.severity === "HIGH" ? "🔴" : diff.severity === "MEDIUM" ? "🟡" : "🟢";
        this.logger.log(`  ${severityIcon} ${diff.table}${diff.column ? `.${diff.column}` : ''}: ${diff.description}`);
        
        if (diff.entity && diff.database) {
          if (diff.entity.type && diff.database.type && diff.entity.type !== diff.database.type) {
            this.logger.log(`    Entity type: ${diff.entity.type}, Database type: ${diff.database.type}`);
          }
          if (diff.entity.nullable !== undefined && diff.database.nullable !== undefined && diff.entity.nullable !== diff.database.nullable) {
            this.logger.log(`    Entity nullable: ${diff.entity.nullable}, Database nullable: ${diff.database.nullable}`);
          }
          if (diff.entity.default !== undefined && diff.database.default !== undefined && diff.entity.default !== diff.database.default) {
            this.logger.log(`    Entity default: ${diff.entity.default}, Database default: ${diff.database.default}`);
          }
        }
      }
      
    } catch (error) {
      this.logger.error("Failed to generate detailed diff report", error);
    }
  }
}