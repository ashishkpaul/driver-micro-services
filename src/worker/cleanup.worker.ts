import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { OutboxArchiveService } from "../domain-events/outbox-archive.service";

@Injectable()
export class CleanupWorker {
  private readonly logger = new Logger(CleanupWorker.name);

  constructor(private archiveService: OutboxArchiveService) {}

  /**
   * Archive old events daily at midnight
   * Moves events older than 7 days to archive table
   */
  @Cron("0 0 * * *") // Daily at midnight
  async archiveOldEvents(): Promise<void> {
    this.logger.log("Starting daily archive process...");

    try {
      const result = await this.archiveService.archiveOldEvents(7);

      if (result.archivedCount > 0) {
        this.logger.log(
          `Archived ${result.archivedCount} events. Total before: ${result.totalBefore}, Total after: ${result.totalAfter}`,
        );

        // Check if hot table is under 100k rows
        if (result.totalAfter > 100000) {
          this.logger.warn(
            `Hot table still has ${result.totalAfter} rows (target: < 100k)`,
          );
        } else {
          this.logger.log(
            `Hot table size is healthy: ${result.totalAfter} rows`,
          );
        }
      } else {
        this.logger.log("No events to archive");
      }
    } catch (error) {
      this.logger.error(
        "Failed to archive old events:",
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * Hard delete archived events monthly for GDPR compliance
   * Removes archived events older than 90 days
   */
  @Cron("0 0 1 * *") // Monthly on the 1st at midnight
  async hardDeleteOldArchivedEvents(): Promise<void> {
    this.logger.log(
      "Starting monthly hard delete process for GDPR compliance...",
    );

    try {
      const result = await this.archiveService.hardDeleteOldArchivedEvents(90);

      if (result.deletedCount > 0) {
        this.logger.log(
          `Hard deleted ${result.deletedCount} archived events for GDPR compliance. Total before: ${result.totalBefore}, Total after: ${result.totalAfter}`,
        );
      } else {
        this.logger.log("No archived events to hard delete");
      }
    } catch (error) {
      this.logger.error(
        "Failed to hard delete old archived events:",
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * Weekly cleanup statistics report
   * Runs every Sunday at 6 AM
   */
  @Cron("0 6 * * 0") // Weekly on Sunday at 6 AM
  async generateCleanupReport(): Promise<void> {
    this.logger.log("Generating weekly cleanup statistics report...");

    try {
      const archiveStats = await this.archiveService.getArchiveStats();
      const hotTableStats = await this.archiveService.getHotTableStats();

      this.logger.log(
        `Weekly Cleanup Report:
        Hot Table: ${hotTableStats.totalEvents} events (oldest: ${hotTableStats.oldestEvent?.toISOString()}, newest: ${hotTableStats.newestEvent?.toISOString()})
        Archive Table: ${archiveStats.totalArchived} events (oldest: ${archiveStats.oldestEvent?.toISOString()}, newest: ${archiveStats.newestEvent?.toISOString()})
        Hot Table Status Distribution: ${JSON.stringify(hotTableStats.eventsByStatus)}
        Archive Status Distribution: ${JSON.stringify(archiveStats.eventsByStatus)}`,
      );

      // Alert if hot table is getting too large
      if (hotTableStats.totalEvents > 100000) {
        this.logger.warn(
          `ALERT: Hot table size is ${hotTableStats.totalEvents} events (target: < 100k)`,
        );
      }

      // Alert if archive table is getting too large
      if (archiveStats.totalArchived > 1000000) {
        this.logger.warn(
          `ALERT: Archive table size is ${archiveStats.totalArchived} events (consider increasing archive retention or manual cleanup)`,
        );
      }
    } catch (error) {
      this.logger.error(
        "Failed to generate cleanup report:",
        error instanceof Error ? error.stack : String(error),
      );
    }
  }

  /**
   * Manual archive trigger for emergency situations
   * Can be called programmatically if hot table gets too large
   */
  async emergencyArchive(): Promise<void> {
    this.logger.warn("Emergency archive triggered!");

    try {
      const result = await this.archiveService.archiveOldEvents(3); // Archive events older than 3 days

      if (result.archivedCount > 0) {
        this.logger.log(
          `Emergency archive completed: ${result.archivedCount} events archived. Total before: ${result.totalBefore}, Total after: ${result.totalAfter}`,
        );
      } else {
        this.logger.log("No events to archive in emergency archive");
      }
    } catch (error) {
      this.logger.error(
        "Failed to perform emergency archive:",
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
