// src/modules/admin.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AdminUser } from '../entities/admin-user.entity';
import { City } from '../entities/city.entity';
import { Zone } from '../entities/zone.entity';
import { AuditLog } from '../entities/audit-log.entity';
import { AdminService } from '../services/admin.service';
import { PasswordService } from '../services/password.service';
import { AuditService } from '../services/audit.service';
import { AdminController } from '../controllers/admin.controller';
import { AuditController } from '../controllers/audit.controller';
import { DriverStatusController } from '../controllers/driver-status.controller';
import { AuditLoggingInterceptor } from '../interceptors/audit-logging.interceptor';
import { APP_INTERCEPTOR } from '@nestjs/core';

@Module({
  imports: [
    TypeOrmModule.forFeature([AdminUser, City, Zone, AuditLog]),
  ],
  providers: [
    AdminService,
    PasswordService,
    AuditService,
    {
      provide: APP_INTERCEPTOR,
      useClass: AuditLoggingInterceptor,
    },
  ],
  controllers: [AdminController, AuditController, DriverStatusController],
  exports: [AdminService, PasswordService, AuditService],
})
export class AdminModule {}