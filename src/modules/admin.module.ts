// src/modules/admin.module.ts
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { RedisModule } from "../redis/redis.module";
import { AdminUser } from "../entities/admin-user.entity";
import { City } from "../entities/city.entity";
import { Zone } from "../entities/zone.entity";
import { AuditLog } from "../entities/audit-log.entity";
import { AdminService } from "../services/admin.service";
import { PasswordService } from "../services/password.service";
import { AuditService } from "../services/audit.service";
import { AdminController } from "../controllers/admin.controller";
import { AuditController } from "../controllers/audit.controller";
import { DriverStatusController } from "../controllers/driver-status.controller";
import { AdminDeliveriesController } from "../controllers/admin-deliveries.controller";
import { ZoneController } from "../controllers/zone.controller";
import { DriverAdminApplicationService } from "../application/driver-admin.application";
import { AuditLoggingInterceptor } from "../interceptors/audit-logging.interceptor";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { DriversModule } from "../drivers/drivers.module";
import { Delivery } from "../deliveries/entities/delivery.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([AdminUser, City, Zone, AuditLog, Delivery]),
    RedisModule,
    DriversModule,
  ],
  providers: [
    AdminService,
    PasswordService,
    AuditService,
    DriverAdminApplicationService,
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditLoggingInterceptor,
    },
  ],
  controllers: [
    AdminController,
    AuditController,
    DriverStatusController,
    AdminDeliveriesController,
    ZoneController,
  ],
  exports: [AdminService, PasswordService, AuditService],
})
export class AdminModule {}
