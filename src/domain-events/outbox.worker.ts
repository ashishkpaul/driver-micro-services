import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { DataSource } from "typeorm";
import { randomUUID } from "crypto";
import { OutboxEvent, EventVersion } from "./outbox.entity";
import { OutboxStatus } from "./outbox-status.enum";
import { OutboxService } from "./outbox.service";
import pLimit from "p-limit";
import { trace, SpanStatusCode, SpanKind } from "@opentelemetry/api";

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
export class OutboxWorker {
  private readonly logger = new Logger(OutboxWorker.name);
  private readonly workerId = randomUUID();
  private readonly BATCH_SIZE = 50;
  private readonly MAX_RETRIES = 10;
  private readonly LOCK_TIMEOUT_SECONDS = 120;

  constructor(
    private dataSource: DataSource,
    private outboxService: OutboxService,
  ) {
    this.logger.log(`Outbox worker started: ${this.workerId}`);
    this.logger.log(
      `Database connection info: host=${process.env.DB_HOST}, port=${process.env.DB_PORT}, db=${process.env.DB_NAME}`,
    );
  }

  @Cron("*/5 * * * * *")
  async process(): Promise<void> {
    const startTime = Date.now();

    try {
      await this.releaseStaleLocks();

      const rawRows = await this.claimBatch(this.BATCH_SIZE);
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

      this.logger.log(`Processing ${rawRows.length} outbox event(s)`);

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

          try {
            await this.processSingle(rawRow, event);
            return { success: true, id: event.id };
          } catch (error) {
            // Error handling happens in processSingle
            return { success: false, id: event.id };
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
      const selectedRows = await manager.query(
        `
          SELECT id, event_type, payload, status, retry_count,
                 last_error, next_retry_at, created_at, processed_at,
                 locked_at, locked_by, idempotency_key
          FROM outbox
          WHERE status = 'PENDING'
            AND (next_retry_at IS NULL OR next_retry_at <= now())
            AND locked_at IS NULL
          ORDER BY created_at
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
  ): Promise<void> {
    try {
      await this.outboxService.handle(event);
      await this.markCompleted(event.id);
    } catch (error) {
      await this.handleFailure(rawRow, event, error);
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
  ): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : String(error);

    // Quarantine logic: force fail on structural errors (Task 6 & 7)
    const isStructuralError =
      errorMessage.includes("Unknown outbox event type")  ||
      errorMessage.includes("Missing eventType")          ||
      errorMessage.includes("No handler registered for")  || // NEW: immediately quarantine unhandled types
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
}
