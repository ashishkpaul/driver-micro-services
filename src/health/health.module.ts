import { Module } from "@nestjs/common";
import { TerminusModule } from "@nestjs/terminus";
import { HealthController } from "./health.controller";
import { HealthAggregatorService } from "./health-aggregator.service";
import { HealthDashboardService } from "./health-dashboard.service";
import { RedisHealthIndicator } from "./redis.health";
import { TypeOrmHealthIndicator } from "./typeorm.health";
import { OutboxHealthIndicator } from "./outbox.health";
import { RedisModule } from "../redis/redis.module";
import { SchemaModule } from "../schema/schema.module";
import { PushModule } from "../push/push.module";
import { BootstrapModule } from "../bootstrap/bootstrap.module";
import { ObservabilityModule } from "../observability/observability.module";

@Module({
  imports: [TerminusModule, RedisModule, SchemaModule, PushModule, BootstrapModule, ObservabilityModule],
  controllers: [HealthController],
  providers: [
    HealthAggregatorService,
    HealthDashboardService,
    RedisHealthIndicator,
    TypeOrmHealthIndicator,
    OutboxHealthIndicator,
  ],
})
export class HealthModule {}
