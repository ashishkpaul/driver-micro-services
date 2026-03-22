/**
 * Entity Snapshot Builder
 *
 * Extracts schema information from TypeORM entities and metadata.
 * This provides the "source of truth" for what the schema should look like.
 */

import { DataSource } from "typeorm";
import {
  SchemaSnapshot,
  TableSchema,
  ColumnSchema,
  IndexSchema,
  ConstraintSchema,
  EnumSchema,
} from "./types";

/**
 * Build schema snapshot from TypeORM entities
 */
export async function buildEntitySnapshot(
  configPath: string,
): Promise<SchemaSnapshot> {
  console.log("  Building entity snapshot from TypeORM metadata...");

  // Load the DataSource configuration
  const mod = require(require("path").resolve(process.cwd(), configPath));
  const dataSource: DataSource = mod.default ?? mod;

  await dataSource.initialize();

  try {
    const snapshot: SchemaSnapshot = {
      tables: [],
      indexes: [],
      constraints: [],
      enums: [],
    };

    // Extract entity metadata
    for (const metadata of dataSource.entityMetadatas) {
      const table: TableSchema = {
        name: metadata.tableName,
        columns: [],
        indexes: [],
        constraints: [],
      };

      // Extract column information
      for (const column of metadata.columns) {
        const columnSchema: ColumnSchema = {
          name: column.databaseName,
          type: column.type as string,
          nullable: column.isNullable,
          default: column.default as string | undefined,
          primaryKey: column.isPrimary,
          unique: column.isUnique || false,
        };
        table.columns.push(columnSchema);
      }

      // Extract index information
      for (const index of metadata.indices) {
        const indexSchema: IndexSchema = {
          name: index.name!,
          table: metadata.tableName,
          columns: index.columns.map((col) => col.databaseName),
          unique: index.isUnique,
        };
        table.indexes.push(indexSchema.name);
        snapshot.indexes.push(indexSchema);
      }

      // Extract constraint information
      for (const constraint of metadata.uniques) {
        const constraintSchema: ConstraintSchema = {
          name: constraint.name!,
          table: metadata.tableName,
          type: "UNIQUE",
          definition: constraint.columns
            .map((col) => col.databaseName)
            .join(", "),
        };
        table.constraints.push(constraintSchema.name);
        snapshot.constraints.push(constraintSchema);
      }

      // Extract foreign key constraints
      for (const relation of metadata.relations) {
        if (relation.isOwning) {
          const constraintSchema: ConstraintSchema = {
            name: `${metadata.tableName}_${relation.propertyName}_fkey`,
            table: metadata.tableName,
            type: "FOREIGN KEY",
            definition: `FOREIGN KEY (${relation.joinColumns.map((col) => col.databaseName).join(", ")}) REFERENCES ${relation.inverseEntityMetadata.tableName}(${relation.inverseJoinColumns.map((col) => col.databaseName).join(", ")})`,
          };
          table.constraints.push(constraintSchema.name);
          snapshot.constraints.push(constraintSchema);
        }
      }

      snapshot.tables.push(table);
    }

    // Extract enum types
    const enumTypes = await extractEnumTypes(dataSource);
    snapshot.enums = enumTypes;

    console.log(
      `  Entity snapshot built: ${snapshot.tables.length} tables, ${snapshot.indexes.length} indexes, ${snapshot.enums.length} enums`,
    );

    return snapshot;
  } finally {
    await dataSource.destroy();
  }
}

/**
 * Extract enum types from the database
 */
async function extractEnumTypes(dataSource: DataSource): Promise<EnumSchema[]> {
  try {
    const result = await dataSource.query(`
      SELECT t.typname as enum_name, array_agg(e.enumlabel ORDER BY e.enumsortorder) as enum_values
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
      GROUP BY t.typname
    `);

    return result.map((row: any) => ({
      name: row.enum_name,
      values: row.enum_values,
    }));
  } catch {
    return [];
  }
}
