import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { DeadLetterService } from "../domain-events/dead-letter.service";
import { AlertingService } from "../services/alerting.service";

@Injectable()
export class DeadLetterWorker {
  private readonly logger = new Logger(DeadLetterWorker.name);

  constructor(
    private deadLetterService: DeadLetterService,
    private alertingService: AlertingService,
  ) {}

  /**
   * Inspect failed events every 5 minutes
   * Groups failed events by error type and alerts on new failures
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async inspectFailedEvents(): Promise<void> {
    this.logger.log("Starting dead letter queue inspection...");

    try {
      const result = await this.deadLetterService.inspectFailedEvents(100);

      // Alert if new failures in last 5 minutes
      if (result.recentFailures.length > 0) {
        this.logger.warn(
          `Found ${result.recentFailures.length} new failures in the last 5 minutes`,
        );
      }

      // Group by error type for analysis
      const errorTypeCounts = Object.entries(result.groupedByError).map(
        ([errorType, events]) => ({
          errorType,
          count: events.length,
        }),
      );

      this.logger.log(
        `Failed events grouped by error type: ${JSON.stringify(errorTypeCounts)}`,
      );

      // Check failure threshold and alert if exceeded
      const thresholdExceeded =
        await this.deadLetterService.checkFailureThreshold(10);

      if (thresholdExceeded) {
        this.logger.error(
          "FAILURE THRESHOLD EXCEEDED: High failure rate detected in the last hour",
        );
        // Task 5: Hook Dead-Letter & SLA Breaches to External Alerts
        await this.alertingService.sendDeadLetterThresholdAlert(10, '1 hour');
      }

      this.logger.log(
        `Dead letter queue inspection completed. Total failed: ${result.totalFailed}`,
      );
    } catch (error) {
      this.logger.error(
        "Failed to inspect dead letter queue:",
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * Clean up expired failed events daily at 2 AM
   * Removes failed events older than 30 days
   */
  @Cron("0 2 * * *") // Daily at 2 AM
  async cleanupExpiredEvents(): Promise<void> {
    this.logger.log("Starting expired events cleanup...");

    try {
      const result = await this.deadLetterService.cleanupExpiredEvents(30);

      if (result.deletedCount > 0) {
        this.logger.log(
          `Cleaned up ${result.deletedCount} expired failed events. Total before: ${result.totalBefore}, Total after: ${result.totalAfter}`,
        );
      } else {
        this.logger.log("No expired events to clean up");
      }
    } catch (error) {
      this.logger.error(
        "Failed to cleanup expired events:",
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * Retry failed events during low traffic hours
   * Runs every hour at 15 minutes past the hour
   */
  @Cron("15 * * * *") // Every hour at 15 minutes past
  async retryFailedEvents(): Promise<void> {
    this.logger.log("Starting automatic retry of failed events...");

    try {
      const result = await this.deadLetterService.retryAllFailedEvents(20);

      if (result.retried > 0) {
        this.logger.log(
          `Retried ${result.retried} failed events: ${result.successful} successful, ${result.failed} failed. Total failed: ${result.totalFailed}`,
        );
      } else {
        this.logger.log("No failed events to retry");
      }
    } catch (error) {
      this.logger.error(
        "Failed to retry failed events:",
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
