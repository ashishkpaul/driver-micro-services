import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, EntityManager } from 'typeorm';
import { OutboxEvent, EventVersion, VersionedEventType } from './outbox.entity';
import { OutboxStatus } from './outbox-status.enum';
import { HandlerRegistry } from './handlers/handler.registry';

/**
 * src/domain-events/outbox.service.ts
 *
 * CRITICAL-2 FIX: generateIdempotencyKey was appending randomUUID() which
 * made every key unique — breaking deduplication entirely. The existingEvent
 * check above it could never match, so every retry / duplicate call created
 * a real outbox row.
 *
 * Fixed: deterministic key based on event type + stable payload fields.
 * Key strategy (priority order):
 *   1. sellerOrderId is the canonical business ID — use it when present
 *   2. deliveryId + driverId for assignment events without sellerOrderId
 *   3. deliveryId + proofType for proof events
 *   4. deliveryId alone as final fallback
 *   5. eventType + timestamp — last resort (still better than random)
 *
 * No import changes needed — randomUUID import removed.
 */
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
    if (!this.isValidVersionedEventType(eventType)) {
      throw new Error(`Unknown versioned event type: ${eventType}`);
    }

    const idempotencyKey = this.generateIdempotencyKey(eventType, payload);

    const existingEvent = manager
      ? await manager.findOne(OutboxEvent, { where: { idempotencyKey } })
      : await this.outboxRepository.findOne({ where: { idempotencyKey } });

    if (existingEvent) {
      this.logger.warn(
        `Duplicate outbox event detected for idempotency key: ${idempotencyKey}. Skipping.`,
      );
      return;
    }

    const record = {
      eventType,
      payload,
      status: OutboxStatus.PENDING,
      retryCount: 0,
      createdAt: new Date(),
      idempotencyKey,
      version,
    };

    if (manager) {
      await manager.save(OutboxEvent, record);
    } else {
      await this.outboxRepository.save(record);
    }

    this.logger.log(
      `Outbox event published: ${eventType} (v${version}) key=${idempotencyKey}`,
    );
  }

  private isValidVersionedEventType(eventType: string): boolean {
    return /^[A-Z_]+_V[1-3]$/.test(eventType);
  }

  async handle(event: OutboxEvent): Promise<void> {
    if (!event.eventType) {
      throw new Error(`Missing eventType for outbox event ${event.id}`);
    }
    this.logger.debug(`Delegating event ${event.id} (${event.eventType}) to handler registry`);
    await this.handlerRegistry.handle(event);
  }

  async processPendingEvents(): Promise<void> {
    const events = await this.outboxRepository.find({
      where: { status: OutboxStatus.PENDING },
      order: { createdAt: 'ASC' },
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

  /**
   * FIXED: Deterministic idempotency key — no random suffix.
   *
   * Priority:
   *  1. sellerOrderId  — canonical, unique per Vendure order
   *  2. deliveryId + driverId — covers assignment events
   *  3. deliveryId + proofType — covers proof events
   *  4. deliveryId alone — general delivery events
   *  5. eventType + ms timestamp — last resort (avoids randomness)
   */
  private generateIdempotencyKey(eventType: string, payload: any): string {
    const sellerOrderId = payload?.sellerOrderId;
    const deliveryId    = payload?.deliveryId;
    const driverId      = payload?.driverId;
    const proofType     = payload?.proofType;

    if (sellerOrderId) {
      return `${eventType}:order:${sellerOrderId}`;
    }
    if (deliveryId && driverId) {
      return `${eventType}:delivery:${deliveryId}:driver:${driverId}`;
    }
    if (deliveryId && proofType) {
      return `${eventType}:delivery:${deliveryId}:proof:${proofType}`;
    }
    if (deliveryId) {
      return `${eventType}:delivery:${deliveryId}`;
    }

    // Last resort — still deterministic per millisecond, no randomness
    this.logger.warn(
      `generateIdempotencyKey: no stable fields in payload for ${eventType}, ` +
      `falling back to timestamp key. Check that publish() callers include sellerOrderId or deliveryId.`,
    );
    return `${eventType}:ts:${Date.now()}`;
  }
}
