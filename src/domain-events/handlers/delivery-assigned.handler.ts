import { Injectable, Logger } from "@nestjs/common";
import { WebSocketService } from "../../websocket/websocket.service";
import { WebhooksService } from "../../webhooks/webhooks.service";
import { PushNotificationService } from "../../push/push.service";
import { EventHandler } from "./base.handler";
import { OutboxEvent, EventVersion } from "../outbox.entity";
import pLimit from "p-limit";

@Injectable()
export class DeliveryAssignedHandler implements EventHandler {
  private readonly logger = new Logger(DeliveryAssignedHandler.name);

  // Concurrency limiters for external calls
  private readonly webhookLimit = pLimit(5); // Max 5 concurrent webhook calls per target
  private readonly pushLimit = pLimit(8); // Max 8 concurrent push notifications

  constructor(
    private wsService: WebSocketService,
    private webhooksService: WebhooksService,
    private pushService: PushNotificationService,
  ) {}

  async handle(event: OutboxEvent): Promise<void> {
    // Strict validation at entry point
    if (!event.eventType) {
      throw new Error(`Missing eventType for outbox event ${event.id}`);
    }

    // Support multiple versions of DELIVERY_ASSIGNED events
    const validEventTypes = [
      "DELIVERY_ASSIGNED_V1",
      "DELIVERY_ASSIGNED_V2",
      "DELIVERY_ASSIGNED_V3",
    ];

    if (!validEventTypes.includes(event.eventType)) {
      throw new Error(
        `Invalid event type for DeliveryAssignedHandler: ${event.eventType}. ` +
          `Supported versions: ${validEventTypes.join(", ")}`,
      );
    }

    // Log version information for debugging
    const version = event.version || 1;
    this.logger.debug(
      `Processing ${event.eventType} (v${version}) for event ${event.id}`,
    );

    this.logger.debug(`Processing delivery assigned event ${event.id}`);

    const driverId = String(event.payload?.driverId ?? "");
    if (!driverId) {
      throw new Error("DELIVERY_ASSIGNED payload missing driverId");
    }

    try {
      // 1. WebSocket notification (local operation, no concurrency limit needed)
      await this.wsService.emitDeliveryAssigned(driverId, event.payload);
      this.logger.log(
        `[PHASE 5] WebSocket DELIVERY_ASSIGNED emitted | driverId=${driverId} | deliveryId=${event.payload?.deliveryId}`,
      );

      // 2. Vendure webhook with concurrency limiting
      if (event.payload?.sellerOrderId && event.payload?.channelId) {
        await this.webhookLimit(async () => {
          await this.webhooksService.emitDeliveryAssigned({
            sellerOrderId: event.payload.sellerOrderId,
            channelId: event.payload.channelId,
            driverId,
            assignmentId: String(event.payload.assignmentId ?? ""),
            assignedAt: event.payload.assignedAt || new Date().toISOString(),
          });
        });
        this.logger.log(
          `[PHASE 5] Vendure webhook DELIVERY_ASSIGNED sent | sellerOrderId=${event.payload.sellerOrderId} | driverId=${driverId}`,
        );
      } else {
        this.logger.warn(
          `Event ${event.id} missing sellerOrderId/channelId; skipping Vendure webhook`,
        );
      }

      // 3. Push notification fallback with concurrency limiting
      const wsConnected = this.wsService.isDriverConnected(driverId);
      await this.pushLimit(async () => {
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
      });

      this.logger.debug(
        `Successfully processed delivery assigned event ${event.id}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to process delivery assigned event ${event.id}:`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }
}
