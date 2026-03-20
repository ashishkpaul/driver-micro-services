import { DataSource } from "typeorm";
import * as dotenv from "dotenv";
import { SnakeNamingStrategy } from "./snake-naming.strategy";

dotenv.config();

export default new DataSource({
  type: "postgres",
  host: process.env.DB_HOST || "localhost",
  port: parseInt(process.env.DB_PORT || "5432"),
  username: process.env.DB_USER || "driver_user",
  password: process.env.DB_PASSWORD || "driver_password",
  database: process.env.DB_NAME || "driver_service",
  entities: ["src/**/*.entity.ts", "src/domain-events/outbox.entity.ts"],
  migrations: [
    process.env.NODE_ENV === "production"
      ? "dist/src/migrations/*.js"
      : "src/migrations/*.ts",
  ],
  migrationsTableName: "_migrations",
  migrationsTransactionMode: "each",
  namingStrategy: new SnakeNamingStrategy(),
  synchronize: false,
  logging: process.env.NODE_ENV === "test" ? false : ["error"],
  extra: {
    max: parseInt(process.env.DB_POOL_MAX || "20", 10),
    min: parseInt(process.env.DB_POOL_MIN || "5", 10),
    idleTimeoutMillis: 30000,
    statement_timeout: 10000, // 10 seconds to prevent hanging queries
  },
});
