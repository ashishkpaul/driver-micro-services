import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { OutboxEvent } from './outbox.entity';
import { OutboxArchiveEvent } from './outbox-archive.entity';
import { OutboxStatus } from './outbox-status.enum';
import { MetricsService } from './metrics.service';

@Injectable()
export class OutboxJanitorService {
  private readonly logger = new Logger(OutboxJanitorService.name);
  private readonly BATCH_SIZE = 100;
  private readonly ARCHIVE_AGE_HOURS = 1; // Archive events older than 1 hour
  private readonly COMPRESSION_AGE_DAYS = 30; // Compress events older than 30 days

  constructor(
    @InjectRepository(OutboxEvent)
    private outboxRepository: Repository<OutboxEvent>,
    @InjectRepository(OutboxArchiveEvent)
    private archiveRepository: Repository<OutboxArchiveEvent>,
    private dataSource: DataSource,
    private metricsService: MetricsService,
  ) {}

  /**
   * Main janitor process - runs every 5 minutes
   */
  async cleanup(): Promise<void> {
    const startTime = Date.now();
    this.logger.log('Starting janitor cleanup process');

    try {
      // Step 1: Archive completed events
      const archivedCount = await this.archiveCompletedEvents();
      
      // Step 2: Compress old archived events
      const compressedCount = await this.compressOldArchives();
      
      // Step 3: Hard delete very old archives (GDPR compliance)
      const deletedCount = await this.hardDeleteOldArchives();

      const duration = Date.now() - startTime;
      this.logger.log(
        `Janitor cleanup completed: ${archivedCount} archived, ${compressedCount} compressed, ${deletedCount} deleted in ${duration}ms`
      );

      // Record metrics
      if (archivedCount > 0) {
        this.metricsService.incrementRetries(); // Count as batch operation
      }

    } catch (error) {
      this.logger.error('Janitor cleanup failed:', error);
      throw error;
    }
  }

  /**
   * Archive completed events older than 1 hour
   */
  private async archiveCompletedEvents(): Promise<number> {
    const cutoffDate = new Date(Date.now() - this.ARCHIVE_AGE_HOURS * 60 * 60 * 1000);
    
    this.logger.debug(`Archiving completed events older than ${this.ARCHIVE_AGE_HOURS} hour(s)`);

    // Find events to archive
    const eventsToArchive = await this.outboxRepository
      .createQueryBuilder('event')
      .where('event.status = :status', { status: OutboxStatus.COMPLETED })
      .andWhere('event.createdAt < :cutoffDate', { cutoffDate })
      .orderBy('event.createdAt', 'ASC')
      .getMany();

    if (eventsToArchive.length === 0) {
      this.logger.debug('No completed events to archive');
      return 0;
    }

    this.logger.log(`Found ${eventsToArchive.length} completed events to archive`);

    // Archive in batches
    let archivedCount = 0;
    for (let i = 0; i < eventsToArchive.length; i += this.BATCH_SIZE) {
      const batch = eventsToArchive.slice(i, i + this.BATCH_SIZE);
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
        archiveEvent.isCompressed = false;
        archiveEvent.originalPayloadSize = JSON.stringify(event.payload).length;
        return archiveEvent;
      });

      try {
        await this.archiveRepository.save(archiveBatch);
        archivedCount += archiveBatch.length;
        this.logger.debug(`Archived batch ${Math.floor(i / this.BATCH_SIZE) + 1}: ${archiveBatch.length} events`);
      } catch (error) {
        this.logger.error(`Failed to archive batch ${Math.floor(i / this.BATCH_SIZE) + 1}:`, error);
        throw error;
      }
    }

    // Delete archived events from hot table
    const archivedIds = eventsToArchive.map((event) => event.id);
    try {
      await this.outboxRepository.delete(archivedIds);
      this.logger.log(`Deleted ${archivedIds.length} archived events from hot table`);
    } catch (error) {
      this.logger.error('Failed to delete archived events from hot table:', error);
      throw error;
    }

    return archivedCount;
  }

  /**
   * Compress old archived events to save storage space
   */
  private async compressOldArchives(): Promise<number> {
    const cutoffDate = new Date(Date.now() - this.COMPRESSION_AGE_DAYS * 24 * 60 * 60 * 1000);
    
    this.logger.debug(`Compressing archived events older than ${this.COMPRESSION_AGE_DAYS} day(s)`);

    // Find uncompressed events to compress
    const eventsToCompress = await this.archiveRepository
      .createQueryBuilder('archive')
      .where('archive.archivedAt < :cutoffDate', { cutoffDate })
      .andWhere('archive.isCompressed = :isCompressed', { isCompressed: false })
      .getMany();

    if (eventsToCompress.length === 0) {
      this.logger.debug('No archived events to compress');
      return 0;
    }

    this.logger.log(`Found ${eventsToCompress.length} archived events to compress`);

    let compressedCount = 0;
    for (const event of eventsToCompress) {
      try {
        // Compress the payload
        const compressedPayload = this.compressPayload(event.payload);
        const compressedSize = JSON.stringify(compressedPayload).length;
        
        // Update the archive record
        await this.archiveRepository.update(event.id, {
          compressedPayload,
          isCompressed: true,
          compressedPayloadSize: compressedSize,
        });

        compressedCount++;
        
        const savings = ((event.originalPayloadSize! - compressedSize) / event.originalPayloadSize!) * 100;
        this.logger.debug(`Compressed event ${event.id}: ${savings.toFixed(1)}% space savings`);
      } catch (error) {
        this.logger.error(`Failed to compress event ${event.id}:`, error);
      }
    }

    return compressedCount;
  }

  /**
   * Hard delete very old archived events (GDPR compliance)
   */
  private async hardDeleteOldArchives(): Promise<number> {
    const retentionDays = parseInt(process.env.ARCHIVE_RETENTION_DAYS || '365', 10);
    const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
    
    this.logger.debug(`Hard deleting archived events older than ${retentionDays} day(s)`);

    const result = await this.archiveRepository
      .createQueryBuilder()
      .delete()
      .where('archivedAt < :cutoffDate', { cutoffDate })
      .execute();

    const deletedCount = result.affected || 0;
    if (deletedCount > 0) {
      this.logger.log(`Hard deleted ${deletedCount} old archived events`);
    }

    return deletedCount;
  }

  /**
   * Enhanced payload compression with multiple strategies
   */
  private compressPayload(payload: any): any {
    try {
      // Strategy 1: Remove null/undefined values and empty objects
      const cleanedPayload = this.cleanPayload(payload);
      
      // Strategy 2: Compress large string fields
      const compressedPayload = this.compressLargeStrings(cleanedPayload);
      
      // Strategy 3: Normalize field names for better compression
      const normalizedPayload = this.normalizeFieldNames(compressedPayload);
      
      return normalizedPayload;
    } catch (error) {
      this.logger.warn('Payload compression failed, returning original:', error);
      return payload;
    }
  }

  /**
   * Remove null/undefined values and empty objects/arrays
   */
  private cleanPayload(payload: any): any {
    if (payload === null || payload === undefined) return undefined;
    
    if (Array.isArray(payload)) {
      return payload
        .map(item => this.cleanPayload(item))
        .filter(item => item !== undefined);
    }
    
    if (typeof payload === 'object') {
      const cleaned: any = {};
      for (const [key, value] of Object.entries(payload)) {
        const cleanedValue = this.cleanPayload(value);
        if (cleanedValue !== undefined) {
          cleaned[key] = cleanedValue;
        }
      }
      return Object.keys(cleaned).length > 0 ? cleaned : undefined;
    }
    
    return payload;
  }

  /**
   * Compress large string fields using base64 encoding for very large strings
   */
  private compressLargeStrings(payload: any): any {
    if (typeof payload === 'string' && payload.length > 1000) {
      // For very large strings, consider base64 encoding
      // This is a placeholder - in production you'd use proper compression
      return payload; // Keeping original for now
    }
    
    if (Array.isArray(payload)) {
      return payload.map(item => this.compressLargeStrings(item));
    }
    
    if (typeof payload === 'object' && payload !== null) {
      const compressed: any = {};
      for (const [key, value] of Object.entries(payload)) {
        compressed[key] = this.compressLargeStrings(value);
      }
      return compressed;
    }
    
    return payload;
  }

  /**
   * Normalize field names to shorter versions for better compression
   */
  private normalizeFieldNames(payload: any): any {
    const fieldMapping: Record<string, string> = {
      'created_at': 'ca',
      'updated_at': 'ua',
      'event_type': 'et',
      'event_id': 'eid',
      'user_id': 'uid',
      'driver_id': 'did',
      'delivery_id': 'dlid',
      'location': 'loc',
      'timestamp': 'ts',
      'status': 'st',
      'payload': 'pl',
      'metadata': 'md',
      'description': 'desc',
      'message': 'msg',
      'error': 'err',
      'success': 'suc',
      'failed': 'fail',
      'completed': 'comp',
      'processing': 'proc',
      'pending': 'pend'
    };

    if (Array.isArray(payload)) {
      return payload.map(item => this.normalizeFieldNames(item));
    }
    
    if (typeof payload === 'object' && payload !== null) {
      const normalized: any = {};
      for (const [key, value] of Object.entries(payload)) {
        const normalizedKey = fieldMapping[key] || key;
        normalized[normalizedKey] = this.normalizeFieldNames(value);
      }
      return normalized;
    }
    
    return payload;
  }

  /**
   * Get janitor statistics
   */
  async getStats(): Promise<{
    totalArchived: number;
    totalCompressed: number;
    oldestEvent: Date | null;
    newestEvent: Date | null;
    eventsByStatus: Record<string, number>;
    compressionSavings: {
      totalOriginalSize: number;
      totalCompressedSize: number;
      totalSavingsPercent: number;
    };
  }> {
    const totalArchived = await this.archiveRepository.count();
    const totalCompressed = await this.archiveRepository.count({ where: { isCompressed: true } });

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

    // Calculate compression savings
    const compressionStats = await this.archiveRepository
      .createQueryBuilder("archive")
      .select("SUM(archive.originalPayloadSize)", "totalOriginalSize")
      .addSelect("SUM(archive.compressedPayloadSize)", "totalCompressedSize")
      .where("archive.isCompressed = true")
      .getRawOne();

    const totalOriginalSize = parseInt(compressionStats.totalOriginalSize || '0', 10);
    const totalCompressedSize = parseInt(compressionStats.totalCompressedSize || '0', 10);
    const totalSavingsPercent = totalOriginalSize > 0 
      ? ((totalOriginalSize - totalCompressedSize) / totalOriginalSize) * 100 
      : 0;

    return {
      totalArchived,
      totalCompressed,
      oldestEvent: oldestEventResult?.oldest ? new Date(oldestEventResult.oldest) : null,
      newestEvent: newestEventResult?.newest ? new Date(newestEventResult.newest) : null,
      eventsByStatus,
      compressionSavings: {
        totalOriginalSize,
        totalCompressedSize,
        totalSavingsPercent,
      },
    };
  }

  /**
   * Manual archive trigger for immediate archiving
   */
  async archiveEventsImmediately(eventIds: number[]): Promise<number> {
    this.logger.log(`Manually archiving ${eventIds.length} events`);

    const eventsToArchive = await this.outboxRepository.findByIds(eventIds);
    if (eventsToArchive.length === 0) {
      this.logger.warn('No events found to archive');
      return 0;
    }

    const archiveBatch = eventsToArchive.map((event) => {
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
      archiveEvent.isCompressed = false;
      archiveEvent.originalPayloadSize = JSON.stringify(event.payload).length;
      return archiveEvent;
    });

    try {
      await this.archiveRepository.save(archiveBatch);
      await this.outboxRepository.delete(eventIds);
      this.logger.log(`Successfully archived ${archiveBatch.length} events`);
      return archiveBatch.length;
    } catch (error) {
      this.logger.error('Failed to manually archive events:', error);
      throw error;
    }
  }
}