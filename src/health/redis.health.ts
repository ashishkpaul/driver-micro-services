import { Injectable } from "@nestjs/common";
import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from "@nestjs/terminus";
import { RedisService } from "../redis/redis.service";

@Injectable()
export class RedisHealthIndicator extends HealthIndicator {
  constructor(private readonly redisService: RedisService) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const isHealthy = await this.redisService.ping();

    if (!isHealthy) {
      throw new HealthCheckError(
        "Redis check failed",
        this.getStatus(key, false),
      );
    }

    return this.getStatus(key, true);
  }
}