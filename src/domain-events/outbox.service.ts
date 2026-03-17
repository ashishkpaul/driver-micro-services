import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, EntityManager } from "typeorm";
import { OutboxEvent } from "./outbox.entity";
import { OutboxStatus } from "./outbox-status.enum";
import { WebSocketService } from "../websocket/websocket.service";
import { WebhooksService } from "../webhooks/webhooks.service";
import { PushNotificationService } from "../push/push.service";

@Injectable()
export class OutboxService {
  private readonly logger = new Logger(OutboxService.name);

  constructor(
    @InjectRepository(OutboxEvent)
    private outboxRepository: Repository<OutboxEvent>,
    private wsService: WebSocketService,
    private vendureSyncService: WebhooksService,
    private pushService: PushNotificationService,
  ) {}

  async publish(
    manager: EntityManager,
    eventType: string,
    payload: any,
  ): Promise<void> {
    await manager.save(OutboxEvent, {
      eventType,
      payload,
      status: OutboxStatus.PENDING,
      retryCount: 0,
      createdAt: new Date(),
    });

    this.logger.log(
      `Outbox event published: ${eventType} for delivery assignment`,
    );
  }

  async handle(event: OutboxEvent): Promise<void> {
    switch (event.eventType) {
      case "DELIVERY_ASSIGNED": {
        const driverId = String(event.payload?.driverId ?? "");
        if (!driverId) {
          throw new Error("DELIVERY_ASSIGNED payload missing driverId");
        }

        await this.wsService.emitDeliveryAssigned(driverId, event.payload);

        if (event.payload?.sellerOrderId && event.payload?.channelId) {
          await this.vendureSyncService.emitDeliveryAssigned({
            sellerOrderId: event.payload.sellerOrderId,
            channelId: event.payload.channelId,
            driverId,
            assignmentId: String(event.payload.assignmentId ?? ""),
            assignedAt:
              typeof event.payload.assignedAt === "string"
                ? event.payload.assignedAt
                : new Date().toISOString(),
          });
        } else {
          this.logger.warn(
            `Outbox event ${event.id} missing sellerOrderId/channelId; skipping Vendure webhook`,
          );
        }

        const wsConnected = this.wsService.isDriverConnected(driverId);
        await this.pushService.notifyOffer(
          {
            offerId: String(event.payload.assignmentId ?? event.id),
            deliveryId: String(event.payload.deliveryId ?? ""),
            expiresAt: event.payload.expiresAt || new Date().toISOString(),
            offerPayload: {
              estimatedEarning: event.payload.estimatedEarning ?? "0",
              estimatedPickupTime: event.payload.estimatedPickupTime ?? 0,
              estimatedDistanceKm: event.payload.estimatedDistanceKm ?? 0,
            },
          },
          driverId,
          wsConnected,
        );
        return;
      }

      default:
        this.logger.warn(`Unknown outbox event type: ${event.eventType}`);
    }
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
}
