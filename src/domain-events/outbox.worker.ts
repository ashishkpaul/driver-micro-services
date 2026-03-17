import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { DataSource } from "typeorm";
import { randomUUID } from "crypto";
import { OutboxEvent } from "./outbox.entity";
import { OutboxStatus } from "./outbox-status.enum";
import { OutboxService } from "./outbox.service";

type ClaimedOutboxRow = {
  id: number;
  event_type: string;
  payload: any;
  status: OutboxStatus;
  retry_count: number;
  last_error: string | null;
  next_retry_at: string | null;
  created_at: string;
  processed_at: string | null;
  locked_at: string | null;
  locked_by: string | null;
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
  }

  @Cron("*/5 * * * * *")
  async process(): Promise<void> {
    try {
      await this.releaseStaleLocks();

      const events = await this.claimBatch(this.BATCH_SIZE);
      if (events.length === 0) {
        return;
      }

      this.logger.log(`Processing ${events.length} outbox event(s)`);
      for (const event of events) {
        await this.processSingle(event);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Outbox worker failure: ${message}`);
    }
  }

  private async releaseStaleLocks(): Promise<void> {
    await this.dataSource.query(
      `
        UPDATE outbox
        SET
          status = 'PENDING',
          locked_at = NULL,
          locked_by = NULL
        WHERE status = 'PROCESSING'
          AND locked_at < now() - ($1 * interval '1 second')
      `,
      [this.LOCK_TIMEOUT_SECONDS],
    );
  }

  private async claimBatch(limit: number): Promise<ClaimedOutboxRow[]> {
    return (await this.dataSource.query(
      `
        UPDATE outbox
        SET
          status = 'PROCESSING',
          locked_at = now(),
          locked_by = $1
        WHERE id IN (
          SELECT id
          FROM outbox
          WHERE status = 'PENDING'
            AND (next_retry_at IS NULL OR next_retry_at <= now())
            AND locked_at IS NULL
          ORDER BY created_at
          LIMIT $2
          FOR UPDATE SKIP LOCKED
        )
        RETURNING *
      `,
      [this.workerId, limit],
    )) as ClaimedOutboxRow[];
  }

  private async processSingle(row: ClaimedOutboxRow): Promise<void> {
    try {
      await this.outboxService.handle(this.toOutboxEvent(row));
      await this.markCompleted(row.id);
    } catch (error) {
      await this.handleFailure(row, error);
    }
  }

  private async markCompleted(id: number): Promise<void> {
    await this.dataSource.query(
      `
        UPDATE outbox
        SET
          status = 'COMPLETED',
          processed_at = now(),
          last_error = NULL,
          locked_at = NULL,
          locked_by = NULL
        WHERE id = $1
      `,
      [id],
    );
  }

  private async handleFailure(
    row: ClaimedOutboxRow,
    error: unknown,
  ): Promise<void> {
    const retryCount = (row.retry_count || 0) + 1;
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (retryCount >= this.MAX_RETRIES) {
      await this.dataSource.query(
        `
          UPDATE outbox
          SET
            status = 'FAILED',
            retry_count = $2,
            last_error = $3,
            locked_at = NULL,
            locked_by = NULL
          WHERE id = $1
        `,
        [row.id, retryCount, errorMessage],
      );

      this.logger.error(`Event moved to failed state: ${row.id}`);
      return;
    }

    const delaySeconds = this.calculateBackoff(retryCount);
    await this.dataSource.query(
      `
        UPDATE outbox
        SET
          status = 'PENDING',
          retry_count = $2,
          last_error = $3,
          next_retry_at = now() + ($4 * interval '1 second'),
          locked_at = NULL,
          locked_by = NULL
        WHERE id = $1
      `,
      [row.id, retryCount, errorMessage, delaySeconds],
    );

    this.logger.warn(
      `Retry ${retryCount} scheduled for outbox event ${row.id} in ${delaySeconds}s`,
    );
  }

  private calculateBackoff(retryCount: number): number {
    return Math.min(2 ** retryCount, 300);
  }

  private toOutboxEvent(row: ClaimedOutboxRow): OutboxEvent {
    return {
      id: row.id,
      eventType: row.event_type,
      payload: row.payload,
      status: row.status,
      retryCount: row.retry_count,
      lastError: row.last_error || undefined,
      nextRetryAt: row.next_retry_at ? new Date(row.next_retry_at) : undefined,
      createdAt: new Date(row.created_at),
      processedAt: row.processed_at ? new Date(row.processed_at) : undefined,
      lockedAt: row.locked_at ? new Date(row.locked_at) : undefined,
      lockedBy: row.locked_by || undefined,
    };
  }
}
