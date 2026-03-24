import { Module, OnModuleInit } from "@nestjs/common";
import { PushNotificationService } from "./push.service";
import { RedisModule } from "../redis/redis.module";
import { Logger } from "@nestjs/common";

@Module({
  imports: [RedisModule],
  providers: [PushNotificationService],
  exports: [PushNotificationService],
})
export class PushModule implements OnModuleInit {
  private readonly logger = new Logger(PushModule.name);

  constructor(private readonly pushService: PushNotificationService) {}

  onModuleInit(): void {
    if (!this.pushService.isEnabled()) {
      this.logger.warn('FEATURE DISABLED: Push Notifications');
      this.logger.warn('Reason: Missing Firebase config');
      this.logger.warn('Impact: Driver notifications unavailable');
    }
  }
}
