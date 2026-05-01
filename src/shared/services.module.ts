import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AlertingService } from "./alerting.service";
import { MailerService } from "./mailer.service";
import { AuditService } from "./audit.service";
import { AuditLog } from "../entities/audit-log.entity";

@Module({
  imports: [TypeOrmModule.forFeature([AuditLog])],
  providers: [AlertingService, MailerService, AuditService],
  exports: [AlertingService, MailerService, AuditService],
})
export class ServicesModule {}
