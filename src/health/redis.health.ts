import { Injectable } from "@nestjs/common";
import {
  HealthIndicatorResult,
  HealthIndicatorService,
} from "@nestjs/terminus";
import { RedisService } from "../redis/redis.service";

@Injectable()
export class RedisHealthIndicator {
  constructor(
    private readonly redisService: RedisService,
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check(key);

    try {
      const isHealthy = await this.redisService.ping();

      if (!isHealthy) {
        return indicator.down();
      }

      return indicator.up();
    } catch {
      return indicator.down();
    }
  }
}
