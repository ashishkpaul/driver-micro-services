import { Module } from "@nestjs/common";
import { AlertingService } from "./alerting.service";
import { MailerService } from "./mailer.service";

@Module({
  providers: [AlertingService, MailerService],
  exports: [AlertingService, MailerService],
})
export class ServicesModule {}
