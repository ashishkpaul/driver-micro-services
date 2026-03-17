import { Injectable } from "@nestjs/common";
import {
  HealthIndicatorResult,
  HealthIndicatorService,
} from "@nestjs/terminus";
import { DataSource } from "typeorm";

@Injectable()
export class OutboxHealthIndicator {
  constructor(
    private readonly dataSource: DataSource,
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check(key);

    try {
      const stats = await this.dataSource.query(`
        SELECT 
          COUNT(*) FILTER (WHERE status = 'PENDING') as pending,
          COUNT(*) FILTER (WHERE status = 'PROCESSING') as processing,
          COUNT(*) FILTER (WHERE status = 'FAILED') as failed,
          MAX(created_at) FILTER (WHERE status = 'PENDING') as oldest_pending
        FROM outbox
      `);

      const pending = parseInt(stats[0].pending || "0");
      const failed = parseInt(stats[0].failed || "0");
      const oldestPending = stats[0].oldest_pending;

      // Calculate oldest pending age in milliseconds
      const oldestPendingAge = oldestPending
        ? Date.now() - new Date(oldestPending).getTime()
        : null;

      // Health check: alert when pending > 1000 or failed > 100
      const isHealthy = pending < 1000 && failed < 100;

      // Log warning when processing lag > 5 minutes (300000ms)
      if (oldestPendingAge && oldestPendingAge > 300000) {
        console.warn(
          `Outbox processing lag detected: oldest pending event is ${Math.floor(oldestPendingAge / 60000)} minutes old`,
        );
      }

      const result = {
        [key]: {
          status: isHealthy ? "up" : "down",
          pending,
          failed,
          processing: parseInt(stats[0].processing || "0"),
          oldestPendingAge: oldestPendingAge,
          isHealthy,
        },
      };

      if (!isHealthy) {
        return indicator.down(result);
      }

      return indicator.up(result);
    } catch (error) {
      console.error("Outbox health check failed:", error);
      return indicator.down({
        [key]: {
          status: "down",
          error: error.message,
        },
      });
    }
  }
}
