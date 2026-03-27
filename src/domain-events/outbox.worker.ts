import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { DataSource } from "typeorm";
import { randomUUID } from "crypto";
import { OutboxEvent, EventVersion } from "./outbox.entity";
import { OutboxStatus } from "./outbox-status.enum";
import { OutboxService } from "./outbox.service";
import { MetricsService } from "./metrics.service";
import { CircuitBreakerService } from "./circuit-breaker.service";
import { WorkerLifecycleService } from "./worker-lifecycle.service";
import { OutboxJanitorService } from "./outbox-janitor.service";
import { AdaptiveBatchService } from "./adaptive-batch.service";
import pLimit from "p-limit";

// Raw row from PostgreSQL (snake_case)
type RawOutboxRow = {
  id: number;
  event_type: string;
  payload: any;
  status: OutboxStatus;
  retry_count: number;
  last_error?: string;
  next_retry_at?: Date;
  created_at: Date;
  processed_at?: Date;
  locked_at?: Date;
  locked_by?: string;
  idempotency_key: string;
  version: number;
};

@Injectable()
export class OutboxWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxWorker.name);
  private readonly workerId = randomUUID();
  private readonly DEFAULT_BATCH_SIZE = 50;
  private readonly MAX_RETRIES = 10;
  private readonly LOCK_TIMEOUT_SECONDS = 120;
  private readonly METRICS_UPDATE_INTERVAL = 30000; // 30 seconds
  private metricsInterval?: NodeJS.Timeout;

  constructor(
    private dataSource: DataSource,
    private outboxService: OutboxService,
    private metricsService: MetricsService,
    private circuitBreakerService: CircuitBreakerService,
    private workerLifecycleService: WorkerLifecycleService,
    private janitorService: OutboxJanitorService,
    private adaptiveBatchService: AdaptiveBatchService,
  ) {
    console.log('');
    console.log('┌─ ⚙ OUTBOX WORKER ' + '─'.repeat(31));
    console.log(`│  Worker id: ${this.workerId.substring(0, 8)}`);
    console.log(`│  Database: ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_NAME}`);
    console.log('│  Status: RUNNING');
    console.log('└' + '─'.repeat(49));
  }

  @Cron("*/5 * * * * *")
  async process(): Promise<void> {
    // Check if shutdown is requested
    if (this.workerLifecycleService.isShutdownRequested()) {
      this.logger.debug("Shutdown requested, skipping batch processing");
      return;
    }

    const startTime = Date.now();

    try {
      await this.releaseStaleLocks();

      // Get adaptive batch size
      const batchSize = await this.adaptiveBatchService.getOptimalBatchSize();
      const rawRows = await this.claimBatch(batchSize);

      if (rawRows.length === 0) {
        return;
      }

      // CRITICAL DEBUG: Show exactly what PostgreSQL is returning
      this.logger.log(`RAW ROWS DEBUG: ${JSON.stringify(rawRows, null, 2)}`);

      // Diagnostic logging (Task 9)
      this.logger.debug(
        `Claimed ${rawRows.length} rows. ` +
          `Sample keys: ${Object.keys(rawRows[0]).join(", ")} | ` +
          `Sample event_type: ${rawRows[0].event_type}`,
      );

      this.logger.log(
        `Processing ${rawRows.length} outbox event(s) with adaptive batch size: ${batchSize}`,
      );

      // Concurrency limiting: Max 10 concurrent event processing
      const limit = pLimit(10);

      // Process events concurrently with limiting
      const processingPromises = rawRows.map((rawRow) =>
        limit(async () => {
          const event = this.toOutboxEvent(rawRow);

          // Pre-validation before handing to service
          if (!event.eventType) {
            this.logger.error(
              `Row ${event.id} has null/undefined eventType. ` +
                `Raw event_type: ${rawRow.event_type}. ` +
                `Forcing immediate failure.`,
            );
            await this.forceFail(event.id, "NULL_EVENT_TYPE");
            return { success: false, id: event.id };
          }

          // Track processing start
          this.workerLifecycleService.addProcessingEvent(
            event.id,
            this.workerId,
          );

          try {
            const eventStartTime = Date.now();
            await this.processSingle(rawRow, event, batchSize);
            const eventDuration = Date.now() - eventStartTime;

            // Record metrics
            this.metricsService.recordProcessingDuration(eventDuration / 1000);
            this.metricsService.incrementEventsProcessed();

            return { success: true, id: event.id };
          } catch (error) {
            // Error handling happens in processSingle
            return { success: false, id: event.id };
          } finally {
            // Always remove from processing set
            this.workerLifecycleService.removeProcessingEvent(
              event.id,
              this.workerId,
            );
          }
        }),
      );

      const results = await Promise.all(processingPromises);

      const successCount = results.filter((r) => r.success).length;
      const failCount = results.filter((r) => !r.success).length;

      const duration = Date.now() - startTime;
      this.logger.log(
        `Batch complete: ${successCount} success, ${failCount} failed, ${duration}ms`,
      );

      // Record batch metrics
      this.metricsService.incrementRetries(); // Count this batch as a retry attempt
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Outbox worker failure: ${message}`);
    }
  }

  private async releaseStaleLocks(): Promise<void> {
    const result = await this.dataSource.query(
      `
        UPDATE outbox
        SET status = 'PENDING', locked_at = NULL, locked_by = NULL
        WHERE status = 'PROCESSING'
          AND locked_at < now() - ($1 * interval '1 second')
      `,
      [this.LOCK_TIMEOUT_SECONDS],
    );

    if (result[1] > 0) {
      this.logger.warn(`Released ${result[1]} stale locks`);
    }
  }

  private async claimBatch(limit: number): Promise<RawOutboxRow[]> {
    // Use a transaction to ensure consistency between SELECT and UPDATE
    return await this.dataSource.transaction(async (manager) => {
      // First, select the IDs to process (with FOR UPDATE to lock them)
      // Priority-based processing: HIGH priority events first, then by creation time
      const selectedRows = await manager.query(
        `
          SELECT id, event_type, payload, status, retry_count,
                 last_error, next_retry_at, created_at, processed_at,
                 locked_at, locked_by, idempotency_key, priority
          FROM outbox
          WHERE status = 'PENDING'
            AND (next_retry_at IS NULL OR next_retry_at <= now())
            AND locked_at IS NULL
          ORDER BY 
            CASE WHEN priority = 'HIGH' THEN 0 
                 WHEN priority = 'MEDIUM' THEN 1 
                 ELSE 2 END,
            created_at
          LIMIT $1
          FOR UPDATE SKIP LOCKED
        `,
        [limit],
      );

      if (selectedRows.length === 0) {
        return [];
      }

      // Extract IDs for the update
      const ids = selectedRows.map((row: any) => row.id);

      // Update the status and lock information
      await manager.query(
        `
          UPDATE outbox
          SET status = 'PROCESSING', locked_at = now(), locked_by = $1
          WHERE id = ANY($2)
        `,
        [this.workerId, ids],
      );

      // Return the selected rows
      return selectedRows.map((r: any) => ({
        id: r.id ?? 0,
        event_type: r.event_type ?? null,
        payload: r.payload ?? {},
        status: r.status ?? "PENDING",
        retry_count: r.retry_count ?? 0,
        last_error: r.last_error ?? null,
        next_retry_at: r.next_retry_at ?? null,
        created_at: r.created_at ?? new Date().toISOString(),
        processed_at: r.processed_at ?? null,
        locked_at: r.locked_at ?? null,
        locked_by: r.locked_by ?? null,
      })) as RawOutboxRow[];
    });
  }

  private async processSingle(
    rawRow: RawOutboxRow,
    event: OutboxEvent,
    batchSize: number,
  ): Promise<void> {
    const processingStartTime = Date.now();

    try {
      await this.outboxService.handle(event);
      await this.markCompleted(event.id);

      // Track successful processing
      await this.trackEventProcessing(
        event.idempotencyKey || `EVENT_${event.id}`,
        event.eventType,
        event.payload,
        event.id,
        this.workerId,
        batchSize,
        Date.now() - processingStartTime,
        "COMPLETED",
      );
    } catch (error) {
      await this.handleFailure(
        rawRow,
        event,
        error,
        batchSize,
        processingStartTime,
      );
    }
  }

  private async markCompleted(id: number): Promise<void> {
    await this.dataSource.query(
      `
        UPDATE outbox
        SET status = 'COMPLETED', processed_at = now(), 
            last_error = NULL, locked_at = NULL, locked_by = NULL
        WHERE id = $1
      `,
      [id],
    );
  }

  private async handleFailure(
    rawRow: RawOutboxRow,
    event: OutboxEvent,
    error: unknown,
    batchSize: number,
    processingStartTime: number,
  ): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Quarantine logic: force fail on structural errors (Task 6 & 7)
    const isStructuralError =
      errorMessage.includes("Unknown outbox event type") ||
      errorMessage.includes("Missing eventType") ||
      errorMessage.includes("No handler registered for") || // NEW: immediately quarantine unhandled types
      !rawRow.event_type;

    let retryCount = (rawRow.retry_count || 0) + 1;

    if (isStructuralError) {
      this.logger.error(
        `Structural error detected for event ${event.id}. ` +
          `Forcing immediate FAIL. Error: ${errorMessage}`,
      );
      retryCount = this.MAX_RETRIES; // Force immediate failure
    }

    if (retryCount >= this.MAX_RETRIES) {
      await this.dataSource.query(
        `
          UPDATE outbox
          SET status = 'FAILED', retry_count = $2, last_error = $3,
              locked_at = NULL, locked_by = NULL
          WHERE id = $1
        `,
        [event.id, retryCount, errorMessage.substring(0, 500)],
      );
      this.logger.error(`Event ${event.id} moved to FAILED state`);

      // Track failed processing
      await this.trackEventProcessing(
        event.idempotencyKey || `EVENT_${event.id}`,
        event.eventType,
        event.payload,
        event.id,
        this.workerId,
        batchSize,
        Date.now() - processingStartTime,
        "FAILED",
        errorMessage,
      );
      return;
    }

    const delaySeconds = this.calculateBackoff(retryCount);
    await this.dataSource.query(
      `
        UPDATE outbox
        SET status = 'PENDING', retry_count = $2, last_error = $3,
            next_retry_at = now() + ($4 * interval '1 second'),
            locked_at = NULL, locked_by = NULL
        WHERE id = $1
      `,
      [event.id, retryCount, errorMessage.substring(0, 500), delaySeconds],
    );

    this.logger.warn(
      `Retry ${retryCount}/${this.MAX_RETRIES} for event ${event.id} ` +
        `in ${delaySeconds}s. Error: ${errorMessage.substring(0, 100)}`,
    );
  }

  private async forceFail(id: number, reason: string): Promise<void> {
    await this.dataSource.query(
      `
        UPDATE outbox
        SET status = 'FAILED', retry_count = $2, last_error = $3,
            locked_at = NULL, locked_by = NULL
        WHERE id = $1
      `,
      [id, this.MAX_RETRIES, `FORCE_FAIL: ${reason}`],
    );
  }

  private calculateBackoff(retryCount: number): number {
    return Math.min(Math.pow(2, retryCount), 300); // Max 5 minutes
  }

  private toOutboxEvent(row: RawOutboxRow): OutboxEvent {
    // Extreme defensive programming - handle malformed rows
    if (!row) {
      this.logger.error("toOutboxEvent received null/undefined row");
      return {
        id: 0,
        eventType: "",
        payload: {},
        status: OutboxStatus.FAILED,
        retryCount: 10,
        createdAt: new Date(),
      } as OutboxEvent;
    }

    // Defensive: handle both snake_case and potential camelCase
    const eventType = row.event_type;
    const rowId = row.id ?? 0;

    if (!eventType) {
      this.logger.warn(`toOutboxEvent: null event_type for row ${rowId}`);
    }

    return {
      id: rowId,
      eventType: eventType || "", // Empty string triggers validation failure
      payload: row.payload || {},
      status: (row.status as OutboxStatus) || OutboxStatus.PENDING,
      priority: "MEDIUM", // Default priority for backward compatibility
      retryCount: row.retry_count || 0,
      lastError: row.last_error || undefined,
      nextRetryAt: row.next_retry_at ? new Date(row.next_retry_at) : undefined,
      createdAt: row.created_at ? new Date(row.created_at) : new Date(),
      processedAt: row.processed_at ? new Date(row.processed_at) : undefined,
      lockedAt: row.locked_at ? new Date(row.locked_at) : undefined,
      lockedBy: row.locked_by || undefined,
      idempotencyKey: row.idempotency_key || `BACKFILL_${rowId}`,
      version: (row.version || 1) as EventVersion,
    };
  }

  /**
   * Track event processing for adaptive learning and debugging
   */
  private async trackEventProcessing(
    idempotencyKey: string,
    eventType: string,
    payload: any,
    eventId: number,
    workerId: string,
    batchSize: number,
    processingDuration: number,
    status: "COMPLETED" | "FAILED",
    error?: string,
  ): Promise<void> {
    try {
      // This would integrate with the IdempotencyTracker service
      // For now, we'll just log the information
      this.logger.debug(
        `Event tracking: key=${idempotencyKey}, type=${eventType}, ` +
          `batchSize=${batchSize}, duration=${processingDuration}ms, status=${status}`,
      );
    } catch (trackingError) {
      this.logger.warn("Failed to track event processing:", trackingError);
    }
  }

  // Lifecycle methods
  onModuleInit(): void {
    this.logger.log("Outbox worker module initialized");

    // Start metrics collection
    this.metricsInterval = setInterval(async () => {
      try {
        await this.metricsService.updateMetrics();
        await this.logWorkerHealth(); // Add health logging
      } catch (error) {
        this.logger.error("Failed to update metrics:", error);
      }
    }, this.METRICS_UPDATE_INTERVAL);
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log("Outbox worker module destroying");

    // Stop metrics collection
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval);
    }

    // Request graceful shutdown
    try {
      await this.workerLifecycleService.shutdown();
    } catch (error) {
      this.logger.error("Graceful shutdown failed:", error);
      // Force shutdown as fallback
      await this.workerLifecycleService.forceShutdown();
    }
  }

  @Cron("0 */5 * * * *") // Every 5 minutes
  async runJanitor(): Promise<void> {
    try {
      this.logger.log("Starting janitor cleanup process");
      await this.janitorService.cleanup();
      this.logger.log("Janitor cleanup completed successfully");
    } catch (error) {
      this.logger.error("Janitor cleanup failed:", error);
    }
  }

  /**
   * Log worker health metrics for operational visibility
   */
  private async logWorkerHealth(): Promise<void> {
    try {
      this.logger.log("OUTBOX STATUS");
      
      // Get pending events count
      const pendingCount = await this.dataSource.query(`
        SELECT COUNT(*) as count
        FROM outbox
        WHERE status = 'PENDING'
      `);
      
      // Get processing stats
      const processingStats = await this.dataSource.query(`
        SELECT 
          COUNT(*) as processing_count,
          COUNT(CASE WHEN retry_count > 0 THEN 1 END) as retrying_count,
          COUNT(CASE WHEN status = 'FAILED' THEN 1 END) as failed_count
        FROM outbox
        WHERE status IN ('PROCESSING', 'FAILED')
      `);

      // Get worker stats
      const workerStats = this.workerLifecycleService.getProcessingStats();

      this.logger.log(`Pending events: ${pendingCount[0]?.count || 0}`);
      this.logger.log(`Processing rate: ${this.metricsService.getMetrics()}/sec`);
      this.logger.log(`Retries: ${processingStats[0]?.retrying_count || 0}`);
      this.logger.log(`Dead letters: ${processingStats[0]?.failed_count || 0}`);
      this.logger.log(`Active workers: ${workerStats.activeWorkers}`);
      this.logger.log(`Processing events: ${workerStats.processingEvents}`);

    } catch (error) {
      this.logger.error("Failed to log worker health:", error);
    }
  }
}
