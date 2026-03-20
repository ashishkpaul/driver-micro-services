import { TypeOrmModuleOptions } from "@nestjs/typeorm";
import { Driver } from "../drivers/entities/driver.entity";
import { Delivery } from "../deliveries/entities/delivery.entity";
import { DeliveryEvent } from "../deliveries/entities/delivery-event.entity";
import { Assignment } from "../assignment/entities/assignment.entity";
import { AdminUser } from "../entities/admin-user.entity";
import { City } from "../entities/city.entity";
import { Zone } from "../entities/zone.entity";
import { AuditLog } from "../entities/audit-log.entity";
import { SnakeNamingStrategy } from "./snake-naming.strategy";

export const databaseConfig: TypeOrmModuleOptions = {
  type: "postgres",
  entities: [
    Driver,
    Delivery,
    DeliveryEvent,
    Assignment,
    AdminUser,
    City,
    Zone,
    AuditLog,
  ],
  migrations: ["dist/migrations/*.js"],
  migrationsRun: false,
  namingStrategy: new SnakeNamingStrategy(),
  migrationsTableName: "_migrations",
  migrationsTransactionMode: "each",
  extra: {
    max: parseInt(process.env.DB_POOL_MAX || "20", 10),
    min: parseInt(process.env.DB_POOL_MIN || "5", 10),
    idleTimeoutMillis: 30000,
    statement_timeout: 10000, // 10 seconds to prevent hanging queries
  },
  // `cli` option is not part of TypeOrmModuleOptions in this environment
  // Keep migrations settings above; migration directory config is handled elsewhere if needed
};
