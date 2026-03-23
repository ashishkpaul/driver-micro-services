/**
 * Schema Detection Engine
 *
 * Uses TypeORM's schema builder to detect entity changes and generate
 * the raw SQL diff between current entities and database schema.
 */

import { DataSource } from "typeorm";
import { SchemaDiff } from "./types";

/**
 * Detect schema differences between entities and database
 */
export async function detectSchemaDiff(
  configPath: string,
): Promise<SchemaDiff> {
  // Load the DataSource configuration
  const mod = require(require("path").resolve(process.cwd(), configPath));
  const dataSource: DataSource = mod.default ?? mod;

  await dataSource.initialize();

  try {
    const builder = dataSource.driver.createSchemaBuilder();
    const log = await builder.log();

    return {
      up: log.upQueries.map((q) => q.query),
      down: log.downQueries.map((q) => q.query),
      newTables: [],
      droppedTables: [],
      alteredTables: [],
    };
  } finally {
    await dataSource.destroy();
  }
}

/**
 * Extract SQL statements from a migration file content
 */
export function extractSqlStatements(content: string): string[] {
  const sqlBlocks: string[] = [];
  const re = /queryRunner\.query\(\s*`([\s\S]*?)`\s*[,)]/g;
  let m: RegExpExecArray | null;

  while ((m = re.exec(content)) !== null) {
    // Split on semicolons to get individual statements
    m[1].split(";").forEach((s) => {
      const trimmed = s.trim();
      if (trimmed.length > 5) sqlBlocks.push(trimmed);
    });
  }

  return sqlBlocks;
}

/**
 * Parse table name from SQL statement (best effort)
 */
export function extractTableName(sql: string): string | null {
  // Match various table reference patterns
  const patterns = [
    /ALTER\s+TABLE\s+["']?(\w+)["']?/i,
    /CREATE\s+TABLE\s+["']?(\w+)["']?/i,
    /DROP\s+TABLE\s+["']?(\w+)["']?/i,
    /RENAME\s+TABLE\s+["']?(\w+)["']?/i,
  ];

  for (const pattern of patterns) {
    const match = sql.match(pattern);
    if (match) return match[1];
  }

  return null;
}

/**
 * Get column type from database information_schema
 */
export async function getColumnType(
  dataSource: DataSource,
  tableName: string,
  columnName: string,
): Promise<string | null> {
  try {
    const result = await dataSource.query(
      `
      SELECT data_type 
      FROM information_schema.columns 
      WHERE table_name = $1 AND column_name = $2
    `,
      [tableName, columnName],
    );

    return result[0]?.data_type || null;
  } catch {
    return null;
  }
}

/**
 * Filter out temporary columns that may have been orphaned from previous runs
 */
function filterTempColumns(snapshot: any): any {
  // Remove columns that look like temp columns (e.g., _temp_*, _old_*, _new_*)
  const tempColumnPattern = /^(_temp_|_old_|_new_|temp_|old_|new_)/i;

  const filtered = { ...snapshot };

  for (const [tableName, tableInfo] of Object.entries(snapshot.tables || {})) {
    if (tableInfo && typeof tableInfo === "object" && "columns" in tableInfo) {
      const columns = tableInfo.columns;
      if (columns && typeof columns === "object") {
        const filteredColumns = Object.fromEntries(
          Object.entries(columns).filter(
            ([colName]) => !tempColumnPattern.test(colName),
          ),
        );
        filtered.tables[tableName] = {
          ...tableInfo,
          columns: filteredColumns,
        };
      }
    }
  }

  return filtered;
}

/**
 * Enhanced schema diff with type detection
 */
export async function detectSchemaDiffWithTypes(
  configPath: string,
): Promise<SchemaDiff & { typeMap?: Map<string, Map<string, string>> }> {
  const diff = await detectSchemaDiff(configPath);

  // Build type mapping for better column rename/type change handling
  const mod = require(require("path").resolve(process.cwd(), configPath));
  const dataSource: DataSource = mod.default ?? mod;

  await dataSource.initialize();

  try {
    const typeMap = new Map<string, Map<string, string>>();

    // Get all columns and their types from the current schema
    const columns = await dataSource.query(`
      SELECT table_name, column_name, data_type
      FROM information_schema.columns 
      WHERE table_schema = 'public'
    `);

    for (const { table_name, column_name, data_type } of columns) {
      if (!typeMap.has(table_name)) {
        typeMap.set(table_name, new Map());
      }
      typeMap.get(table_name)!.set(column_name, data_type);
    }

    return { ...diff, typeMap };
  } finally {
    await dataSource.destroy();
  }
}

/**
 * Detect schema differences with temp column filtering
 */
export async function detectSchemaDiffFiltered(
  configPath: string,
): Promise<SchemaDiff> {
  // Load the DataSource configuration
  const mod = require(require("path").resolve(process.cwd(), configPath));
  const dataSource: DataSource = mod.default ?? mod;

  await dataSource.initialize();

  try {
    const builder = dataSource.driver.createSchemaBuilder();
    const log = await builder.log();

    // Filter out temp columns from the generated SQL
    const filteredUp = log.upQueries
      .map((q) => q.query)
      .filter((sql) => !isTempColumnOperation(sql));

    const filteredDown = log.downQueries
      .map((q) => q.query)
      .filter((sql) => !isTempColumnOperation(sql));

    return {
      up: filteredUp,
      down: filteredDown,
      newTables: [],
      droppedTables: [],
      alteredTables: [],
    };
  } finally {
    await dataSource.destroy();
  }
}

/**
 * Check if a SQL statement operates on a temp column
 */
function isTempColumnOperation(sql: string): boolean {
  const tempColumnPattern = /^(_temp_|_old_|_new_|temp_|old_|new_)/i;

  // Extract column name from various SQL patterns
  const columnPatterns = [
    /ADD\s+"?(\w+)"?\s+/i,
    /ALTER\s+COLUMN\s+"?(\w+)"?/i,
    /DROP\s+COLUMN\s+"?(\w+)"?/i,
    /RENAME\s+COLUMN\s+"?(\w+)"?/i,
  ];

  for (const pattern of columnPatterns) {
    const match = sql.match(pattern);
    if (match && tempColumnPattern.test(match[1])) {
      return true;
    }
  }

  return false;
}
