import { DataSource, DataSourceOptions } from "typeorm";
import * as dotenv from "dotenv";
import { databaseConfig } from "./database.config";

dotenv.config();

// Spread the existing databaseConfig to ensure consistency
const options: DataSourceOptions = {
  ...(databaseConfig as DataSourceOptions),
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432", 10),
  username: process.env.DB_USERNAME || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
  database: process.env.DB_DATABASE || "driver_db",
  // Ensure the CLI specifically uses the TS files for migrations
  migrations: ["src/migrations/*.ts"],
};

export default new DataSource(options);
