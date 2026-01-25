import { TypeOrmModuleOptions } from "@nestjs/typeorm";
import { Driver } from "../drivers/entities/driver.entity";
import { Delivery } from "../deliveries/entities/delivery.entity";
import { DeliveryEvent } from "../deliveries/entities/delivery-event.entity";
import { Assignment } from "../assignment/entities/assignment.entity";

export const databaseConfig: TypeOrmModuleOptions = {
  type: "postgres",
  entities: [Driver, Delivery, DeliveryEvent, Assignment],
  migrations: ["dist/migrations/*.js"],
  migrationsRun: true,
  // `cli` option is not part of TypeOrmModuleOptions in this environment
  // Keep migrations settings above; migration directory config is handled elsewhere if needed
};
