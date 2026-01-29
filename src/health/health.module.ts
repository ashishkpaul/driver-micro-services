import { Module } from "@nestjs/common";
import { TerminusModule } from "@nestjs/terminus";
import { HealthController } from "./health.controller";
import { RedisHealthIndicator } from "./redis.health";
import { TypeOrmHealthIndicator } from "./typeorm.health";
import { RedisModule } from "../redis/redis.module";

@Module({
  imports: [TerminusModule, RedisModule],
  controllers: [HealthController],
  providers: [
    RedisHealthIndicator,
    TypeOrmHealthIndicator,
  ],
})
export class HealthModule {}
