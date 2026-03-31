/**
 * src/config/data-source.ts
 *
 * TypeORM DataSource used by the TypeORM CLI (migration:run, migration:generate, etc.)
 * and by scripts that require a direct DataSource connection.
 *
 * FIX (March 21 2026):
 *   A recent commit changed the env var names from DB_USER/DB_NAME to
 *   DB_USERNAME/DB_DATABASE. The project's .env file uses DB_USER and DB_NAME
 *   (matching the docker-compose DB_USER/DB_NAME convention). The mismatch caused
 *   every CLI connection attempt to fall through to the 'postgres'/'driver_db'
 *   defaults, producing "password authentication failed for user postgres".
 *
 *   Restored env var names:
 *     DB_USER     (was DB_USERNAME)
 *     DB_NAME     (was DB_DATABASE)
 *
 *   The DB_USERNAME / DB_DATABASE fallbacks are kept as secondary lookups so that
 *   environments using that convention also work without needing a file change.
 */

import { DataSource, DataSourceOptions } from "typeorm";
import * as dotenv from "dotenv";
import { SnakeNamingStrategy } from "./snake-naming.strategy";
import * as path from "path";
dotenv.config();
const root = process.cwd();
const options: DataSourceOptions = {
  type: "postgres",

  host: process.env.DB_HOST || "postgres",
  port: parseInt(process.env.DB_PORT || "5432", 10),

  // Primary: DB_USER (matches .env and docker-compose convention)
  // Fallback: DB_USERNAME (alternate convention used by some cloud providers)
  username: process.env.DB_USER || process.env.DB_USERNAME || "driver_user",

  password: process.env.DB_PASSWORD || "driver_password",

  // Primary: DB_NAME (matches .env and docker-compose convention)
  // Fallback: DB_DATABASE (alternate convention)
  database: process.env.DB_NAME || process.env.DB_DATABASE || "driver_service",

  // Entities — explicit glob patterns kept from the previous commit
  entities: [path.join(root, "src/**/*.entity.ts")],

  migrations: [path.join(root, "src/migrations/*.ts")],

  namingStrategy: new SnakeNamingStrategy(),
  migrationsTableName: "_migrations",
  migrationsRun: false,
  migrationsTransactionMode: "each",
  synchronize: false,
  logging: process.env.NODE_ENV === "test" ? false : ["error"],

  extra: {
    max: parseInt(process.env.DB_POOL_MAX || "20", 10),
    min: parseInt(process.env.DB_POOL_MIN || "5", 10),
    idleTimeoutMillis: 30000,
    statement_timeout: 10000,
  },
};

export default new DataSource(options);
