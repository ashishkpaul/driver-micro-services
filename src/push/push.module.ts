import { Module } from "@nestjs/common";
import { PushNotificationService } from "./push.service";
import { RedisModule } from "../redis/redis.module";

@Module({
  imports: [RedisModule],
  providers: [PushNotificationService],
  exports: [PushNotificationService],
})
export class PushModule {}
