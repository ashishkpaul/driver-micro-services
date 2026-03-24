import { Injectable, Logger } from "@nestjs/common";
import { DataSource } from "typeorm";
import {
  SchemaSnapshot,
  TableSchema,
  ColumnSchema,
  IndexSchema,
  ConstraintSchema,
  EnumSchema,
} from "../engine/types";

@Injectable()
export class SchemaSnapshotService {
  private readonly logger = new Logger(SchemaSnapshotService.name);

  constructor(private readonly dataSource: DataSource) {}

  /**
   * Build entity snapshot from TypeORM metadata
   */
  async buildEntitySnapshot(): Promise<SchemaSnapshot> {
    this.logger.log("Building entity snapshot from TypeORM metadata...");

    try {
      const entityMetadatas = this.dataSource.entityMetadatas;

      const tables: TableSchema[] = entityMetadatas.map((metadata) => ({
        name: metadata.tableName,
        columns: metadata.columns.map((col) => ({
          name: col.databaseName,
          type: col.type as string,
          nullable: col.isNullable,
          default: col.default as string,
          primaryKey: col.isPrimary,
          unique: false, // Simplified for compatibility
        })),
        indexes: [],
        constraints: [],
      }));

      const indexes: IndexSchema[] = [];
      const constraints: ConstraintSchema[] = [];
      const enums: EnumSchema[] = [];

      const snapshot: SchemaSnapshot = {
        tables,
        indexes,
        constraints,
        enums,
      };

      this.logger.log(
        `Entity snapshot built: ${tables.length} tables, ${indexes.length} indexes`,
      );

      return snapshot;
    } catch (error) {
      this.logger.error("Failed to build entity snapshot", error);
      throw error;
    }
  }

  /**
   * Build database snapshot from actual schema
   */
  async buildDatabaseSnapshot(): Promise<SchemaSnapshot> {
    this.logger.log("Building database snapshot from actual schema...");

    try {
      const queryRunner = this.dataSource.createQueryRunner();
      await queryRunner.connect();

      try {
        const tables = await queryRunner.getTables();

        const tableSchemas: TableSchema[] = tables.map((table) => ({
          name: table.name,
          columns: table.columns.map((col) => ({
            name: col.name,
            type: col.type,
            nullable: col.isNullable,
            default: col.default,
            primaryKey: col.isPrimary,
            unique: false, // Simplified for compatibility
          })),
          indexes: [],
          constraints: [],
        }));

        const indexes: IndexSchema[] = [];
        const constraints: ConstraintSchema[] = [];
        const enums: EnumSchema[] = [];

        const snapshot: SchemaSnapshot = {
          tables: tableSchemas,
          indexes,
          constraints,
          enums,
        };

        this.logger.log(
          `Database snapshot built: ${tableSchemas.length} tables`,
        );

        return snapshot;
      } finally {
        await queryRunner.release();
      }
    } catch (error) {
      this.logger.error("Failed to build database snapshot", error);
      throw error;
    }
  }

  /**
   * Creates a snapshot of the current database schema (for compatibility analysis)
   */
  async createSnapshot(): Promise<{
    timestamp: string;
    entities: any[];
    tables: any[];
    indexes: any[];
    constraints: any[];
    hash: string;
  }> {
    this.logger.log('📸 Creating schema snapshot for compatibility analysis...');

    try {
      const snapshot = {
        timestamp: new Date().toISOString(),
        entities: await this.getEntitiesSnapshot(),
        tables: await this.getTablesSnapshot(),
        indexes: await this.getIndexesSnapshot(),
        constraints: await this.getConstraintsSnapshot(),
        hash: '', // Will be calculated
      };

      // Calculate hash of the snapshot
      snapshot.hash = this.calculateSnapshotHash(snapshot);

      this.logger.log(`✅ Schema snapshot created: ${snapshot.hash}`);
      return snapshot;

    } catch (error) {
      this.logger.error('❌ Failed to create schema snapshot', error.stack);
      throw new Error(`Schema snapshot creation failed: ${error.message}`);
    }
  }

  /**
   * Gets entities snapshot
   */
  private async getEntitiesSnapshot(): Promise<any[]> {
    const entityMetadatas = this.dataSource.entityMetadatas;
    return entityMetadatas.map(metadata => ({
      name: metadata.name,
      tableName: metadata.tableName,
      columns: metadata.columns.map(col => ({
        name: col.databaseName,
        type: col.type,
        nullable: col.isNullable,
        default: col.default,
        primaryKey: col.isPrimary,
      }))
    }));
  }

  /**
   * Gets tables snapshot
   */
  private async getTablesSnapshot(): Promise<any[]> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    try {
      const tables = await queryRunner.getTables();
      return tables.map(table => ({
        name: table.name,
        columns: table.columns.map(col => ({
          name: col.name,
          type: col.type,
          nullable: col.isNullable,
          default: col.default,
          primaryKey: col.isPrimary,
        }))
      }));
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Gets indexes snapshot
   */
  private async getIndexesSnapshot(): Promise<any[]> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    try {
      await queryRunner.startTransaction();
      
      const tables = await queryRunner.getTables();
      const indexes: { indexname: string; indexdef: string }[] = [];
      
      // Process tables sequentially to avoid QueryRunner concurrency issues
      for (const table of tables) {
        const tableIndexes = await queryRunner.query(
          `SELECT indexname, indexdef FROM pg_indexes WHERE tablename = $1`,
          [table.name]
        );
        indexes.push(...(tableIndexes as { indexname: string; indexdef: string }[]));
      }
      
      await queryRunner.commitTransaction();
      return indexes;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Gets constraints snapshot
   */
  private async getConstraintsSnapshot(): Promise<any[]> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    try {
      await queryRunner.startTransaction();
      
      const constraints = await queryRunner.query(`
        SELECT 
          tc.table_name,
          tc.constraint_name,
          tc.constraint_type,
          kcu.column_name,
          ccu.table_name AS foreign_table_name,
          ccu.column_name AS foreign_column_name
        FROM information_schema.table_constraints tc
        LEFT JOIN information_schema.key_column_usage kcu
          ON tc.constraint_name = kcu.constraint_name
          AND tc.table_schema = kcu.table_schema
        LEFT JOIN information_schema.constraint_column_usage ccu
          ON tc.constraint_name = ccu.constraint_name
          AND tc.table_schema = ccu.table_schema
        WHERE tc.table_schema = 'public'
      `);
      
      await queryRunner.commitTransaction();
      return constraints;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Calculates snapshot hash
   */
  private calculateSnapshotHash(snapshot: {
    timestamp: string;
    entities: any[];
    tables: any[];
    indexes: any[];
    constraints: any[];
  }): string {
    const crypto = require('crypto');
    const hash = crypto.createHash('sha256');
    hash.update(JSON.stringify(snapshot));
    return hash.digest('hex');
  }
}