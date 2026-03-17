import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, EntityManager } from "typeorm";
import { OutboxEvent } from "./outbox.entity";
import { OutboxStatus } from "./outbox-status.enum";
import { OutboxService } from "./outbox.service";

@Injectable()
export class DeadLetterService {
  private readonly logger = new Logger(DeadLetterService.name);

  constructor(
    @InjectRepository(OutboxEvent)
    private outboxRepository: Repository<OutboxEvent>,
    private outboxService: OutboxService,
  ) {}

  /**
   * Inspect failed events and group them by error type
   * @param limit Maximum number of failed events to inspect
   * @returns Grouped failed events by error type
   */
  async inspectFailedEvents(limit: number = 100): Promise<{
    totalFailed: number;
    groupedByError: Record<string, OutboxEvent[]>;
    recentFailures: OutboxEvent[];
  }> {
    const failedEvents = await this.outboxRepository.find({
      where: { status: OutboxStatus.FAILED },
      order: { createdAt: "DESC" },
      take: limit,
    });

    const totalFailed = await this.outboxRepository.count({
      where: { status: OutboxStatus.FAILED },
    });

    // Group by error type (using lastError field)
    const groupedByError: Record<string, OutboxEvent[]> = {};
    const recentFailures: OutboxEvent[] = [];

    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    for (const event of failedEvents) {
      const errorType = event.lastError || "Unknown Error";

      if (!groupedByError[errorType]) {
        groupedByError[errorType] = [];
      }
      groupedByError[errorType].push(event);

      // Check if this is a recent failure (last 5 minutes)
      // Note: Using createdAt since updatedAt doesn't exist in the entity
      if (event.createdAt && event.createdAt > fiveMinutesAgo) {
        recentFailures.push(event);
      }
    }

    this.logger.log(
      `Inspected ${failedEvents.length} failed events. Total failed: ${totalFailed}. Recent failures (last 5min): ${recentFailures.length}`,
    );

    return {
      totalFailed,
      groupedByError,
      recentFailures,
    };
  }

  /**
   * Retry a specific failed event
   * @param eventId The ID of the event to retry
   * @param manager Optional transaction manager
   * @returns Promise indicating success or failure
   */
  async retryEvent(eventId: number, manager?: EntityManager): Promise<void> {
    const event = await this.outboxRepository.findOne({
      where: { id: eventId, status: OutboxStatus.FAILED },
    });

    if (!event) {
      throw new Error(`Failed event with ID ${eventId} not found`);
    }

    this.logger.log(
      `Retrying failed event ${eventId} of type ${event.eventType}`,
    );

    try {
      // Reset error state
      const updateData = {
        status: OutboxStatus.PENDING,
        lastError: undefined,
        retryCount: event.retryCount + 1,
      };

      if (manager) {
        await manager.update(OutboxEvent, eventId, updateData);
      } else {
        await this.outboxRepository.update(eventId, updateData);
      }

      // Re-process the event
      await this.outboxService.handle(event);

      // Mark as completed
      const completionData = {
        status: OutboxStatus.COMPLETED,
        processedAt: new Date(),
      };

      if (manager) {
        await manager.update(OutboxEvent, eventId, completionData);
      } else {
        await this.outboxRepository.update(eventId, completionData);
      }

      this.logger.log(`Successfully retried event ${eventId}`);
    } catch (error) {
      this.logger.error(
        `Failed to retry event ${eventId}:`,
        error instanceof Error ? error.stack : String(error),
      );

      // Update with new error
      const errorData = {
        status: OutboxStatus.FAILED,
        lastError: error instanceof Error ? error.message : String(error),
        retryCount: event.retryCount + 1,
        updatedAt: new Date(),
      };

      if (manager) {
        await manager.update(OutboxEvent, eventId, errorData);
      } else {
        await this.outboxRepository.update(eventId, errorData);
      }

      throw error;
    }
  }

  /**
   * Retry all failed events
   * @param limit Maximum number of events to retry
   * @returns Promise with retry results
   */
  async retryAllFailedEvents(limit: number = 50): Promise<{
    totalFailed: number;
    retried: number;
    successful: number;
    failed: number;
  }> {
    const failedEvents = await this.outboxRepository.find({
      where: { status: OutboxStatus.FAILED },
      order: { createdAt: "ASC" }, // Retry oldest first
      take: limit,
    });

    const totalFailed = await this.outboxRepository.count({
      where: { status: OutboxStatus.FAILED },
    });

    let retried = 0;
    let successful = 0;
    let failed = 0;

    for (const event of failedEvents) {
      try {
        await this.retryEvent(event.id);
        successful++;
      } catch (error) {
        failed++;
      }
      retried++;
    }

    this.logger.log(
      `Retry all completed: ${retried} retried, ${successful} successful, ${failed} failed. Total failed: ${totalFailed}`,
    );

    return {
      totalFailed,
      retried,
      successful,
      failed,
    };
  }

  /**
   * Get failed events with pagination
   * @param page Page number (1-based)
   * @param limit Number of events per page
   * @param errorType Optional error type filter
   * @returns Paginated failed events
   */
  async getFailedEvents(
    page: number = 1,
    limit: number = 20,
    errorType?: string,
  ): Promise<{
    events: OutboxEvent[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const skip = (page - 1) * limit;

    const queryBuilder = this.outboxRepository
      .createQueryBuilder("event")
      .where("event.status = :status", { status: OutboxStatus.FAILED });

    if (errorType) {
      queryBuilder.andWhere("event.lastError LIKE :errorType", {
        errorType: `%${errorType}%`,
      });
    }

    const [events, total] = await queryBuilder
      .orderBy("event.createdAt", "DESC")
      .skip(skip)
      .take(limit)
      .getManyAndCount();

    const totalPages = Math.ceil(total / limit);

    return {
      events,
      total,
      page,
      totalPages,
    };
  }

  /**
   * Check for new failures in the last hour and alert if threshold exceeded
   * @param threshold Maximum number of failures before alerting
   * @returns Promise indicating if alert was triggered
   */
  async checkFailureThreshold(threshold: number = 10): Promise<boolean> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const recentFailures = await this.outboxRepository
      .createQueryBuilder("event")
      .where("event.status = :status", { status: OutboxStatus.FAILED })
      .andWhere("event.createdAt >= :oneHourAgo", { oneHourAgo })
      .getCount();

    if (recentFailures > threshold) {
      this.logger.error(
        `ALERT: High failure rate detected! ${recentFailures} failures in the last hour (threshold: ${threshold})`,
      );
      return true;
    }

    return false;
  }

  /**
   * Clean up expired failed events (older than 30 days)
   * @param daysToKeep Number of days to keep failed events (default: 30)
   * @returns Promise with cleanup results
   */
  async cleanupExpiredEvents(daysToKeep: number = 30): Promise<{
    deletedCount: number;
    totalBefore: number;
    totalAfter: number;
  }> {
    const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);

    const totalBefore = await this.outboxRepository.count({
      where: { status: OutboxStatus.FAILED },
    });

    const expiredEvents = await this.outboxRepository
      .createQueryBuilder("event")
      .where("event.status = :status", { status: OutboxStatus.FAILED })
      .andWhere("event.createdAt < :cutoffDate", { cutoffDate })
      .getMany();

    let deletedCount = 0;
    for (const event of expiredEvents) {
      try {
        await this.outboxRepository.remove(event);
        deletedCount++;
      } catch (error) {
        this.logger.error(
          `Failed to delete expired event ${event.id}:`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }

    const totalAfter = await this.outboxRepository.count({
      where: { status: OutboxStatus.FAILED },
    });

    this.logger.log(
      `Cleanup completed: ${deletedCount} expired events deleted. Total before: ${totalBefore}, Total after: ${totalAfter}`,
    );

    return {
      deletedCount,
      totalBefore,
      totalAfter,
    };
  }
}
