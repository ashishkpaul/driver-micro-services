import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, EntityManager } from "typeorm";
import { OutboxEvent } from "./outbox.entity";
import { OutboxArchiveEvent } from "./outbox-archive.entity";

@Injectable()
export class OutboxArchiveService {
  private readonly logger = new Logger(OutboxArchiveService.name);

  constructor(
    @InjectRepository(OutboxEvent)
    private outboxRepository: Repository<OutboxEvent>,
    @InjectRepository(OutboxArchiveEvent)
    private archiveRepository: Repository<OutboxArchiveEvent>,
  ) {}

  /**
   * Archive events older than specified days
   * @param daysToKeep Number of days to keep in hot table (default: 7)
   * @returns Promise with archiving results
   */
  async archiveOldEvents(daysToKeep: number = 7): Promise<{
    archivedCount: number;
    totalBefore: number;
    totalAfter: number;
  }> {
    const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);

    this.logger.log(
      `Starting archive process for events older than ${daysToKeep} days (before ${cutoffDate.toISOString()})`,
    );

    const totalBefore = await this.outboxRepository.count();

    // Find events to archive
    const eventsToArchive = await this.outboxRepository
      .createQueryBuilder("event")
      .where("event.createdAt < :cutoffDate", { cutoffDate })
      .orderBy("event.createdAt", "ASC")
      .getMany();

    if (eventsToArchive.length === 0) {
      this.logger.log("No events to archive");
      return {
        archivedCount: 0,
        totalBefore,
        totalAfter: totalBefore,
      };
    }

    this.logger.log(`Found ${eventsToArchive.length} events to archive`);

    // Archive events in batches to avoid memory issues
    const batchSize = 100;
    let archivedCount = 0;

    for (let i = 0; i < eventsToArchive.length; i += batchSize) {
      const batch = eventsToArchive.slice(i, i + batchSize);
      const archiveBatch = batch.map((event) => {
        const archiveEvent = new OutboxArchiveEvent();
        archiveEvent.eventType = event.eventType;
        archiveEvent.payload = event.payload;
        archiveEvent.status = event.status;
        archiveEvent.retryCount = event.retryCount;
        archiveEvent.lastError = event.lastError;
        archiveEvent.nextRetryAt = event.nextRetryAt;
        archiveEvent.createdAt = event.createdAt;
        archiveEvent.processedAt = event.processedAt;
        archiveEvent.lockedAt = event.lockedAt;
        archiveEvent.lockedBy = event.lockedBy;
        archiveEvent.idempotencyKey = event.idempotencyKey || undefined;
        archiveEvent.archivedAt = new Date();
        return archiveEvent;
      });

      try {
        await this.archiveRepository.save(archiveBatch);
        archivedCount += archiveBatch.length;
        this.logger.debug(
          `Archived batch ${Math.floor(i / batchSize) + 1}: ${archiveBatch.length} events`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to archive batch ${Math.floor(i / batchSize) + 1}:`,
          error instanceof Error ? error.stack : String(error),
        );
        throw error;
      }
    }

    // Delete archived events from hot table
    const archivedIds = eventsToArchive.map((event) => event.id);
    try {
      await this.outboxRepository.delete(archivedIds);
      this.logger.log(
        `Deleted ${archivedIds.length} archived events from hot table`,
      );
    } catch (error) {
      this.logger.error(
        "Failed to delete archived events from hot table:",
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }

    const totalAfter = await this.outboxRepository.count();

    this.logger.log(
      `Archive completed: ${archivedCount} events archived. Total before: ${totalBefore}, Total after: ${totalAfter}`,
    );

    return {
      archivedCount,
      totalBefore,
      totalAfter,
    };
  }

  /**
   * Hard delete archived events older than specified days (GDPR compliance)
   * @param daysToKeep Number of days to keep archived events (default: 90)
   * @returns Promise with deletion results
   */
  async hardDeleteOldArchivedEvents(daysToKeep: number = 90): Promise<{
    deletedCount: number;
    totalBefore: number;
    totalAfter: number;
  }> {
    const cutoffDate = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);

    this.logger.log(
      `Starting hard delete process for archived events older than ${daysToKeep} days (before ${cutoffDate.toISOString()})`,
    );

    const totalBefore = await this.archiveRepository.count();

    // Find archived events to delete
    const eventsToDelete = await this.archiveRepository
      .createQueryBuilder("archive")
      .where("archive.archivedAt < :cutoffDate", { cutoffDate })
      .getMany();

    if (eventsToDelete.length === 0) {
      this.logger.log("No archived events to delete");
      return {
        deletedCount: 0,
        totalBefore,
        totalAfter: totalBefore,
      };
    }

    this.logger.log(`Found ${eventsToDelete.length} archived events to delete`);

    // Delete in batches
    const batchSize = 100;
    let deletedCount = 0;

    for (let i = 0; i < eventsToDelete.length; i += batchSize) {
      const batch = eventsToDelete.slice(i, i + batchSize);
      const batchIds = batch.map((event) => event.id);

      try {
        await this.archiveRepository.delete(batchIds);
        deletedCount += batch.length;
        this.logger.debug(
          `Deleted batch ${Math.floor(i / batchSize) + 1}: ${batch.length} events`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to delete batch ${Math.floor(i / batchSize) + 1}:`,
          error instanceof Error ? error.stack : String(error),
        );
        throw error;
      }
    }

    const totalAfter = await this.archiveRepository.count();

    this.logger.log(
      `Hard delete completed: ${deletedCount} events deleted. Total before: ${totalBefore}, Total after: ${totalAfter}`,
    );

    return {
      deletedCount,
      totalBefore,
      totalAfter,
    };
  }

  /**
   * Get archived events with pagination
   * @param page Page number (1-based)
   * @param limit Number of events per page
   * @param eventType Optional event type filter
   * @param status Optional status filter
   * @returns Paginated archived events
   */
  async getArchivedEvents(
    page: number = 1,
    limit: number = 20,
    eventType?: string,
    status?: string,
  ): Promise<{
    events: OutboxArchiveEvent[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const skip = (page - 1) * limit;

    const queryBuilder = this.archiveRepository
      .createQueryBuilder("archive")
      .orderBy("archive.archivedAt", "DESC");

    if (eventType) {
      queryBuilder.andWhere("archive.eventType = :eventType", { eventType });
    }

    if (status) {
      queryBuilder.andWhere("archive.status = :status", { status });
    }

    const [events, total] = await queryBuilder
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
   * Get archive statistics
   * @returns Archive statistics
   */
  async getArchiveStats(): Promise<{
    totalArchived: number;
    oldestEvent: Date | null;
    newestEvent: Date | null;
    eventsByStatus: Record<string, number>;
  }> {
    const totalArchived = await this.archiveRepository.count();

    const oldestEventResult = await this.archiveRepository
      .createQueryBuilder("archive")
      .select("MIN(archive.createdAt)", "oldest")
      .getRawOne();

    const newestEventResult = await this.archiveRepository
      .createQueryBuilder("archive")
      .select("MAX(archive.createdAt)", "newest")
      .getRawOne();

    const statusResults = await this.archiveRepository
      .createQueryBuilder("archive")
      .select("archive.status", "status")
      .addSelect("COUNT(*)", "count")
      .groupBy("archive.status")
      .getRawMany();

    const eventsByStatus = statusResults.reduce((acc, result) => {
      acc[result.status] = parseInt(result.count, 10);
      return acc;
    }, {});

    return {
      totalArchived,
      oldestEvent: oldestEventResult?.oldest
        ? new Date(oldestEventResult.oldest)
        : null,
      newestEvent: newestEventResult?.newest
        ? new Date(newestEventResult.newest)
        : null,
      eventsByStatus,
    };
  }

  /**
   * Get hot table statistics
   * @returns Hot table statistics
   */
  async getHotTableStats(): Promise<{
    totalEvents: number;
    oldestEvent: Date | null;
    newestEvent: Date | null;
    eventsByStatus: Record<string, number>;
  }> {
    const totalEvents = await this.outboxRepository.count();

    const oldestEventResult = await this.outboxRepository
      .createQueryBuilder("event")
      .select("MIN(event.createdAt)", "oldest")
      .getRawOne();

    const newestEventResult = await this.outboxRepository
      .createQueryBuilder("event")
      .select("MAX(event.createdAt)", "newest")
      .getRawOne();

    const statusResults = await this.outboxRepository
      .createQueryBuilder("event")
      .select("event.status", "status")
      .addSelect("COUNT(*)", "count")
      .groupBy("event.status")
      .getRawMany();

    const eventsByStatus = statusResults.reduce((acc, result) => {
      acc[result.status] = parseInt(result.count, 10);
      return acc;
    }, {});

    return {
      totalEvents,
      oldestEvent: oldestEventResult?.oldest
        ? new Date(oldestEventResult.oldest)
        : null,
      newestEvent: newestEventResult?.newest
        ? new Date(newestEventResult.newest)
        : null,
      eventsByStatus,
    };
  }
}
