import { Injectable, Logger } from "@nestjs/common";
import { InjectDataSource } from "@nestjs/typeorm";
import { DataSource } from "typeorm";

export interface OutboxEvent {
  id?: string;
  eventType: string;
  payload: Record<string, any>;
  createdAt?: Date;
  processedAt?: Date;
  isProcessed?: boolean;
}

@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(@InjectDataSource() private dataSource: DataSource) {}

  async publish(
    manager: any,
    eventType: string,
    payload: Record<string, any>,
  ): Promise<void> {
    const outboxEvent = {
      eventType,
      payload,
      createdAt: new Date(),
      isProcessed: false,
    };

    await manager.query(
      `
      INSERT INTO outbox_events (event_type, payload, created_at, is_processed)
      VALUES ($1, $2, $3, $4)
    `,
      [eventType, JSON.stringify(payload), outboxEvent.createdAt, false],
    );

    this.logger.log(
      `Outbox event published: ${eventType} for delivery assignment`,
    );
  }

  async processPendingEvents(): Promise<void> {
    const events = await this.dataSource.query(`
      SELECT * FROM outbox_events 
      WHERE is_processed = false 
      ORDER BY created_at ASC 
      LIMIT 100
    `);

    for (const event of events) {
      try {
        await this.processEvent(event);
        await this.markAsProcessed(event.id);
      } catch (error) {
        this.logger.error(`Failed to process outbox event ${event.id}:`, error);
      }
    }
  }

  private async processEvent(event: any): Promise<void> {
    // This would be implemented by a worker that handles different event types
    this.logger.log(`Processing event ${event.id}: ${event.event_type}`);
  }

  private async markAsProcessed(eventId: string): Promise<void> {
    await this.dataSource.query(
      `
      UPDATE outbox_events 
      SET processed_at = NOW(), is_processed = true 
      WHERE id = $1
    `,
      [eventId],
    );
  }
}
