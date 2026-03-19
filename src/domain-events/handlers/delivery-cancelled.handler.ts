import { Injectable, Logger } from "@nestjs/common";
import { WebhooksService } from "../../webhooks/webhooks.service";
import { EventHandler } from "./base.handler";
import { OutboxEvent, EventVersion } from "../outbox.entity";
import pLimit from "p-limit";

@Injectable()
export class DeliveryCancelledHandler implements EventHandler {
  private readonly logger = new Logger(DeliveryCancelledHandler.name);

  // Concurrency limiters for external calls
  private readonly webhookLimit = pLimit(5); // Max 5 concurrent webhook calls per target

  constructor(private webhooksService: WebhooksService) {}

  async handle(event: OutboxEvent): Promise<void> {
    // Strict validation at entry point
    if (!event.eventType) {
      throw new Error(`Missing eventType for outbox event ${event.id}`);
    }

    // Support multiple versions of DELIVERY_CANCELLED events
    const validEventTypes = [
      "DELIVERY_CANCELLED_V1",
      "DELIVERY_CANCELLED_V2",
      "DELIVERY_CANCELLED_V3",
    ];

    if (!validEventTypes.includes(event.eventType)) {
      throw new Error(
        `Invalid event type for DeliveryCancelledHandler: ${event.eventType}. ` +
          `Supported versions: ${validEventTypes.join(", ")}`,
      );
    }

    // Log version information for debugging
    const version = event.version || 1;
    this.logger.debug(
      `Processing ${event.eventType} (v${version}) for event ${event.id}`,
    );

    this.logger.debug(`Processing delivery cancelled event ${event.id}`);

    if (!event.payload?.sellerOrderId || !event.payload?.channelId) {
      throw new Error(
        "DELIVERY_CANCELLED payload missing sellerOrderId or channelId",
      );
    }

    try {
      // Vendure webhook with concurrency limiting
      await this.webhookLimit(async () => {
        await this.webhooksService.emitDeliveryCancelled({
          sellerOrderId: event.payload.sellerOrderId,
          channelId: event.payload.channelId,
          reason: event.payload.reason || "Cancelled by driver or system",
        });
      });

      this.logger.debug(
        `Successfully processed delivery cancelled event ${event.id}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to process delivery cancelled event ${event.id}:`,
        error instanceof Error ? error.stack : String(error),
      );
      throw error;
    }
  }
}
