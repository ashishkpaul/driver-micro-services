import { Controller, Get } from "@nestjs/common";
import {
  HealthCheck,
  HealthCheckService,
} from "@nestjs/terminus";
import { TypeOrmHealthIndicator } from "./typeorm.health";
import { RedisHealthIndicator } from "./redis.health";

@Controller("health")
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: TypeOrmHealthIndicator,
    private redis: RedisHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.db.isHealthy("database"),
      () => this.redis.isHealthy("redis"),
    ]);
  }
}
