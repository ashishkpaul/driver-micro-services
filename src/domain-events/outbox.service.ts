import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, EntityManager } from "typeorm";
import { OutboxEvent } from "./outbox.entity";

@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(
    @InjectRepository(OutboxEvent)
    private outboxRepository: Repository<OutboxEvent>,
  ) {}

  async publish(
    manager: EntityManager,
    eventType: string,
    payload: any,
  ): Promise<void> {
    await manager.save(OutboxEvent, {
      eventType,
      payload,
      status: "PENDING",
      createdAt: new Date(),
    });

    this.logger.log(
      `Outbox event published: ${eventType} for delivery assignment`,
    );
  }

  async processPendingEvents(): Promise<void> {
    const events = await this.outboxRepository.find({
      where: { status: "PENDING" },
      order: { createdAt: "ASC" },
      take: 100,
    });

    for (const event of events) {
      try {
        await this.processEvent(event);
        await this.markAsProcessed(event.id);
      } catch (error) {
        this.logger.error(`Failed to process outbox event ${event.id}:`, error);
      }
    }
  }

  private async processEvent(event: OutboxEvent): Promise<void> {
    // This would be implemented by a worker that handles different event types
    this.logger.log(`Processing event ${event.id}: ${event.eventType}`);
  }

  private async markAsProcessed(eventId: number): Promise<void> {
    await this.outboxRepository.update(eventId, {
      status: "DONE",
      processedAt: new Date(),
    });
  }
}
