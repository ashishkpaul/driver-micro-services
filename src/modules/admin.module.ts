// src/modules/admin.module.ts
import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { RedisModule } from "../redis/redis.module";
import { AdminUser } from "../entities/admin-user.entity";
import { City } from "../entities/city.entity";
import { Zone } from "../entities/zone.entity";
import { AuditLog } from "../entities/audit-log.entity";
import { AdminService } from "../shared/admin.service";
import { PasswordService } from "../shared/password.service";
import { AuditService } from "../shared/audit.service";
import { AdminController } from "../admin/controllers/admin.controller";
import { AuditController } from "../admin/controllers/audit.controller";
import { DriverStatusController } from "../admin/controllers/driver-status.controller";
import { AdminDeliveriesController } from "../admin/controllers/admin-deliveries.controller";
import { ZoneController } from "../admin/controllers/zone.controller";
import { CityController } from "../admin/controllers/city.controller";
import { DriverAdminApplicationService } from "../admin/driver-admin.application";
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
    CityController,
  ],
  exports: [AdminService, PasswordService, AuditService],
})
export class AdminModule {}
