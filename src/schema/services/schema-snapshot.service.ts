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
}