import { Module } from "@nestjs/common";
import { TerminusModule } from "@nestjs/terminus";
import { HealthController } from "./health.controller";
import { TypeOrmHealthIndicator } from "./typeorm.health";
import { RedisHealthIndicator } from "./redis.health";
import { RedisModule } from "../redis/redis.module";

@Module({
  imports: [
    TerminusModule,
    RedisModule, // 👈 REQUIRED
  ],
  controllers: [HealthController],
  providers: [
    TypeOrmHealthIndicator,
    RedisHealthIndicator,
  ],
})
export class HealthModule {}
