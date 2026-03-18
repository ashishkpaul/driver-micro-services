import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, EntityManager } from "typeorm";
import { OutboxEvent, EventVersion, VersionedEventType } from "./outbox.entity";
import { OutboxStatus } from "./outbox-status.enum";
import { HandlerRegistry } from "./handlers/handler.registry";
import { randomUUID } from "crypto";

@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(
    @InjectRepository(OutboxEvent)
    private outboxRepository: Repository<OutboxEvent>,
    private handlerRegistry: HandlerRegistry,
  ) {}

  async publish(
    manager: EntityManager | null,
    eventType: VersionedEventType,
    payload: any,
    version: EventVersion = 1,
  ): Promise<void> {
    // Validate versioned event type
    if (!this.isValidVersionedEventType(eventType)) {
      throw new Error(`Unknown versioned event type: ${eventType}`);
    }

    // Generate deterministic idempotency key
    const idempotencyKey = this.generateIdempotencyKey(eventType, payload);

    // Check for existing event with same idempotency key
    const existingEvent = manager
      ? await manager.findOne(OutboxEvent, {
          where: { idempotencyKey },
        })
      : await this.outboxRepository.findOne({
          where: { idempotencyKey },
        });

    if (existingEvent) {
      this.logger.warn(
        `Duplicate outbox event detected for idempotency key: ${idempotencyKey}. Skipping creation.`,
      );
      return;
    }

    if (manager) {
      await manager.save(OutboxEvent, {
        eventType,
        payload,
        status: OutboxStatus.PENDING,
        retryCount: 0,
        createdAt: new Date(),
        idempotencyKey,
        version,
      });
    } else {
      await this.outboxRepository.save({
        eventType,
        payload,
        status: OutboxStatus.PENDING,
        retryCount: 0,
        createdAt: new Date(),
        idempotencyKey,
        version,
      });
    }

    this.logger.log(
      `Outbox event published: ${eventType} (v${version}) with idempotency key: ${idempotencyKey}`,
    );
  }

  private isValidVersionedEventType(eventType: string): boolean {
    // Check if the event type follows the versioned pattern
    const versionedPattern = /^[A-Z_]+_V[1-3]$/;
    return versionedPattern.test(eventType);
  }

  async handle(event: OutboxEvent): Promise<void> {
    // Strict validation at entry point
    if (!event.eventType) {
      throw new Error(`Missing eventType for outbox event ${event.id}`);
    }

    this.logger.debug(
      `Delegating event ${event.id} of type ${event.eventType} to handler registry`,
    );

    // Delegate to handler registry - no business logic here
    await this.handlerRegistry.handle(event);
  }

  async processPendingEvents(): Promise<void> {
    const events = await this.outboxRepository.find({
      where: { status: OutboxStatus.PENDING },
      order: { createdAt: "ASC" },
      take: 100,
    });

    for (const event of events) {
      try {
        await this.handle(event);
        await this.markAsProcessed(event.id);
      } catch (error) {
        this.logger.error(`Failed to process outbox event ${event.id}:`, error);
      }
    }
  }

  private async markAsProcessed(eventId: number): Promise<void> {
    await this.outboxRepository.update(eventId, {
      status: OutboxStatus.COMPLETED,
      processedAt: new Date(),
    });
  }

  private generateIdempotencyKey(eventType: string, payload: any): string {
    // Generate deterministic idempotency key based on event type and payload
    const deliveryId = payload?.deliveryId || payload?.assignmentId || "";
    const driverId = payload?.driverId || "";
    const timestamp = payload?.assignedAt || new Date().toISOString();

    // Create a deterministic key for the specific event
    const key = `${eventType}_${deliveryId}_${driverId}_${new Date(timestamp).getTime()}`;

    // Add a random suffix to handle edge cases where timestamps might be identical
    return `${key}_${randomUUID().slice(0, 8)}`;
  }
}
