import { Controller, Get } from "@nestjs/common";
import { HealthCheck, HealthCheckService } from "@nestjs/terminus";
import { TypeOrmHealthIndicator } from "./typeorm.health";
import { RedisHealthIndicator } from "./redis.health";
import { OutboxHealthIndicator } from "./outbox.health";

@Controller("health")
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: TypeOrmHealthIndicator,
    private redis: RedisHealthIndicator,
    private outbox: OutboxHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.db.isHealthy("database"),
      () => this.redis.isHealthy("redis"),
      () => this.outbox.isHealthy("outbox"),
    ]);
  }

  @Get("outbox")
  async outboxHealth() {
    return this.outbox.isHealthy("outbox");
  }
}
