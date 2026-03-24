import { Controller, Get } from "@nestjs/common";
import { HealthCheck, HealthCheckService } from "@nestjs/terminus";
import { TypeOrmHealthIndicator } from "./typeorm.health";
import { RedisHealthIndicator } from "./redis.health";
import { OutboxHealthIndicator } from "./outbox.health";
import { HealthAggregatorService } from "./health-aggregator.service";

@Controller("health")
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: TypeOrmHealthIndicator,
    private redis: RedisHealthIndicator,
    private outbox: OutboxHealthIndicator,
    private healthAggregator: HealthAggregatorService,
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

  /**
   * System readiness endpoint
   */
  @Get("readiness")
  async readiness() {
    const readinessState = this.healthAggregator.getReadinessState();
    
    return {
      ready: readinessState.isReady,
      currentPhase: readinessState.currentPhase,
      completedPhases: Array.from(readinessState.completedPhases),
      readiness: readinessState.isReady ? 'READY' : 'NOT_READY',
    };
  }

  /**
   * System status endpoint with comprehensive information
   */
  @Get("status")
  async systemStatus() {
    return await this.healthAggregator.getSystemStatus();
  }

  /**
   * Feature status endpoint
   */
  @Get("features")
  async featureStatus() {
    return await this.healthAggregator.getFeatureStatus();
  }

  /**
   * Database pool status endpoint
   */
  @Get("db-pool")
  async dbPoolStatus() {
    return await this.healthAggregator.getDbPoolStatus();
  }

  /**
   * Schema status endpoint
   */
  @Get("schema")
  async schemaStatus() {
    return await this.healthAggregator.getSchemaStatus();
  }
}
