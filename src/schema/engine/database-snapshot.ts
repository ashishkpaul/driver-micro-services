/**
 * Database Snapshot Builder
 *
 * Reads actual database schema from information_schema and pg_catalog.
 * This provides the current state of the database for comparison.
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
 * Build schema snapshot from actual database
 */
export async function buildDatabaseSnapshot(
  configPath: string,
): Promise<SchemaSnapshot> {
  console.log("  Building database snapshot from actual schema...");

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

    // Extract table and column information
    const tableResult = await dataSource.query(`
      SELECT 
        c.relname as table_name,
        a.attname as column_name,
        pg_catalog.format_type(a.atttypid, a.atttypmod) as data_type,
        a.attnotnull as not_null,
        a.atthasdef as has_default,
        pg_get_expr(d.adbin, d.adrelid) as default_value,
        a.attposition as ordinal_position
      FROM pg_class c
      JOIN pg_attribute a ON a.attrelid = c.oid
      LEFT JOIN pg_attrdef d ON (d.adrelid = a.attrelid AND d.adnum = a.attnum)
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relkind = 'r'
        AND n.nspname = 'public'
        AND a.attnum > 0
        AND NOT a.attisdropped
      ORDER BY c.relname, a.attnum
    `);

    // Group columns by table
    const tableMap = new Map<string, TableSchema>();
    for (const row of tableResult) {
      if (!tableMap.has(row.table_name)) {
        tableMap.set(row.table_name, {
          name: row.table_name,
          columns: [],
          indexes: [],
          constraints: [],
        });
      }

      const table = tableMap.get(row.table_name)!;
      const column: ColumnSchema = {
        name: row.column_name,
        type: row.data_type,
        nullable: !row.not_null,
        default: row.has_default ? row.default_value : undefined,
        primaryKey: false, // Will be set below
        unique: false, // Will be set below
      };
      table.columns.push(column);
    }

    // Extract primary key information
    const pkResult = await dataSource.query(`
      SELECT 
        tc.table_name,
        kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_schema = 'public'
    `);

    for (const row of pkResult) {
      const table = tableMap.get(row.table_name);
      if (table) {
        const column = table.columns.find((c) => c.name === row.column_name);
        if (column) {
          column.primaryKey = true;
        }
      }
    }

    // Extract unique constraints
    const uniqueResult = await dataSource.query(`
      SELECT 
        tc.table_name,
        kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      WHERE tc.constraint_type = 'UNIQUE'
        AND tc.table_schema = 'public'
    `);

    for (const row of uniqueResult) {
      const table = tableMap.get(row.table_name);
      if (table) {
        const column = table.columns.find((c) => c.name === row.column_name);
        if (column) {
          column.unique = true;
        }
      }
    }

    // Extract index information
    const indexResult = await dataSource.query(`
      SELECT 
        t.relname as table_name,
        i.relname as index_name,
        a.attname as column_name,
        ix.indisunique as is_unique
      FROM pg_class t
      JOIN pg_index ix ON t.oid = ix.indrelid
      JOIN pg_class i ON i.oid = ix.indexrelid
      JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = ANY(ix.indkey)
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE t.relkind = 'r'
        AND n.nspname = 'public'
      ORDER BY t.relname, i.relname, a.attnum
    `);

    const indexMap = new Map<string, IndexSchema>();
    for (const row of indexResult) {
      const indexKey = `${row.table_name}.${row.index_name}`;
      if (!indexMap.has(indexKey)) {
        indexMap.set(indexKey, {
          name: row.index_name,
          table: row.table_name,
          columns: [],
          unique: row.is_unique,
        });
      }

      const index = indexMap.get(indexKey)!;
      if (!index.columns.includes(row.column_name)) {
        index.columns.push(row.column_name);
      }
    }

    // Extract constraint information
    const constraintResult = await dataSource.query(`
      SELECT 
        tc.table_name,
        tc.constraint_name,
        tc.constraint_type,
        pg_get_constraintdef(c.oid) as definition
      FROM information_schema.table_constraints tc
      JOIN pg_constraint c ON tc.constraint_name = c.conname
      JOIN pg_namespace n ON n.oid = c.connamespace
      WHERE tc.table_schema = 'public'
        AND tc.constraint_type IN ('PRIMARY KEY', 'FOREIGN KEY', 'UNIQUE', 'CHECK')
      ORDER BY tc.table_name, tc.constraint_name
    `);

    for (const row of constraintResult) {
      const constraint: ConstraintSchema = {
        name: row.constraint_name,
        table: row.table_name,
        type: row.constraint_type as any,
        definition: row.definition,
      };
      snapshot.constraints.push(constraint);
    }

    // Extract enum types
    const enumResult = await dataSource.query(`
      SELECT t.typname as enum_name, array_agg(e.enumlabel ORDER BY e.enumsortorder) as enum_values
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
      GROUP BY t.typname
    `);

    for (const row of enumResult) {
      const enumSchema: EnumSchema = {
        name: row.enum_name,
        values: row.enum_values,
      };
      snapshot.enums.push(enumSchema);
    }

    // Build final snapshot
    snapshot.tables = Array.from(tableMap.values());
    snapshot.indexes = Array.from(indexMap.values());

    // Link indexes to tables
    for (const table of snapshot.tables) {
      table.indexes = snapshot.indexes
        .filter((idx) => idx.table === table.name)
        .map((idx) => idx.name);
    }

    // Link constraints to tables
    for (const table of snapshot.tables) {
      table.constraints = snapshot.constraints
        .filter((con) => con.table === table.name)
        .map((con) => con.name);
    }

    console.log(
      `  Database snapshot built: ${snapshot.tables.length} tables, ${snapshot.indexes.length} indexes, ${snapshot.enums.length} enums`,
    );

    return snapshot;
  } finally {
    await dataSource.destroy();
  }
}
