import { Controller, Get, Query, VERSION_NEUTRAL } from "@nestjs/common";
import { HealthCheck, HealthCheckService } from "@nestjs/terminus";
import { TypeOrmHealthIndicator } from "./typeorm.health";
import { RedisHealthIndicator } from "./redis.health";
import { OutboxHealthIndicator } from "./outbox.health";
import { HealthAggregatorService } from "./health-aggregator.service";
import { HealthDashboardService } from "./health-dashboard.service";

@Controller({ path: "health", version: VERSION_NEUTRAL })
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: TypeOrmHealthIndicator,
    private redis: RedisHealthIndicator,
    private outbox: OutboxHealthIndicator,
    private healthAggregator: HealthAggregatorService,
    private healthDashboardService: HealthDashboardService,
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
      readiness: readinessState.isReady ? "READY" : "NOT_READY",
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
   * Database pool status endpoint with detailed metrics
   */
  @Get("db-pool")
  async dbPoolStatus(@Query("detailed") detailed?: string) {
    const includeDetails = detailed === "true";
    return await this.healthAggregator.getDbPoolStatus(includeDetails);
  }

  /**
   * Schema status endpoint with detailed drift information
   */
  @Get("schema")
  async schemaStatus(@Query("detailed") detailed?: string) {
    const includeDetails = detailed === "true";
    return await this.healthAggregator.getSchemaStatus(includeDetails);
  }

  /**
   * System metrics endpoint for monitoring dashboards
   */
  @Get("metrics")
  async systemMetrics() {
    return await this.healthAggregator.getSystemMetrics();
  }

  /**
   * Component health status with dependency mapping
   */
  @Get("components")
  async componentHealth() {
    return await this.healthAggregator.getComponentHealth();
  }

  /**
   * Health summary for quick status overview
   */
  @Get("summary")
  async healthSummary() {
    return await this.healthAggregator.getHealthSummary();
  }

  /**
   * Comprehensive health dashboard with alerts and recommendations
   */
  @Get("dashboard")
  async healthDashboard() {
    return await this.healthDashboardService.getHealthDashboard();
  }
}
