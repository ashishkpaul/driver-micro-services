import { DataSource, DataSourceOptions } from "typeorm";
import * as dotenv from "dotenv";
import { SnakeNamingStrategy } from "./snake-naming.strategy";

dotenv.config();

// Create a proper DataSource configuration
const options: DataSourceOptions = {
  type: "postgres",
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432", 10),
  username: process.env.DB_USERNAME || "postgres",
  password: process.env.DB_PASSWORD || "postgres",
  database: process.env.DB_DATABASE || "driver_db",
  entities: [
    __dirname + "/../drivers/entities/*.entity{.ts,.js}",
    __dirname + "/../deliveries/entities/*.entity{.ts,.js}",
    __dirname + "/../assignment/entities/*.entity{.ts,.js}",
    __dirname + "/../entities/*.entity{.ts,.js}",
  ],
  migrations: ["src/migrations/*.ts"],
  namingStrategy: new SnakeNamingStrategy(),
  migrationsTableName: "_migrations",
  migrationsRun: false,
  migrationsTransactionMode: "each",
  extra: {
    max: parseInt(process.env.DB_POOL_MAX || "20", 10),
    min: parseInt(process.env.DB_POOL_MIN || "5", 10),
    idleTimeoutMillis: 30000,
    statement_timeout: 10000,
  },
};

export default new DataSource(options);

