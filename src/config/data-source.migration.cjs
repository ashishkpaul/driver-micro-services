const { DataSource } = require("typeorm");
require("dotenv").config();

module.exports = new DataSource({
  type: "postgres",
  host: process.env.DB_HOST || "localhost",
  port: Number(process.env.DB_PORT || "5432"),
  username: process.env.DB_USER || "driver_user",
  password: process.env.DB_PASSWORD || "driver_password",
  database: process.env.DB_NAME || "driver_service",
  entities: [],
  migrations: ["dist-migrations/migrations/*.cjs"],
  synchronize: false,
});