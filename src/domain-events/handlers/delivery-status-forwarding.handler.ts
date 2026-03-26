import { Injectable, Logger } from "@nestjs/common";
import { WebhooksService } from "../../webhooks/webhooks.service";
import { EventHandler } from "./base.handler";
import { OutboxEvent } from "../outbox.entity";

@Injectable()
export class DeliveryStatusForwardingHandler implements EventHandler {
  private readonly logger = new Logger(DeliveryStatusForwardingHandler.name);

  constructor(private webhookService: WebhooksService) {}

  async handle(event: OutboxEvent): Promise<void> {
    const eventType = event.eventType;
    const payload = event.payload;

    this.logger.debug(`Handling event ${event.id} (${eventType})`);

    switch (eventType) {
      case "DELIVERY_ASSIGNED_V1":
        await this.handleDeliveryAssigned(event);
        break;
      case "DELIVERY_PICKED_UP_V1":
        await this.handleDeliveryPickedUp(event);
        break;
      case "DELIVERY_DROPPED_OFF_V1":
        await this.handleDeliveryDroppedOff(event);
        break;
      case "PROOF_ACCEPTED_V1":
        await this.handleProofAccepted(event);
        break;
      case "DELIVERY_PICKUP_CONFIRMED_V1":
        await this.handleDeliveryPickupConfirmed(event);
        break;
      case "DELIVERY_DROPOFF_CONFIRMED_V1":
        await this.handleDeliveryDropoffConfirmed(event);
        break;
      case "DELIVERY_FAILED_V1":
        await this.handleDeliveryFailed(event);
        break;
      case "DELIVERY_CANCELLED_V1":
        await this.handleDeliveryCancelled(event);
        break;
      default:
        this.logger.warn(`No handler registered for event type: ${eventType}`);
        throw new Error(`Unknown outbox event type: ${eventType}`);
    }
  }

  private async handleDeliveryAssigned(event: OutboxEvent): Promise<void> {
    const payload = event.payload;
    const { sellerOrderId, channelId, driverId, assignmentId, assignedAt } =
      payload;

    this.logger.log(
      `Processing DELIVERY_ASSIGNED_V1 for seller order ${sellerOrderId}`,
    );

    // Notify Vendure via webhook
    await this.webhookService.emitDeliveryAssigned({
      sellerOrderId,
      channelId,
      driverId,
      assignmentId,
      assignedAt: assignedAt || new Date().toISOString(),
    });
  }

  private async handleDeliveryPickedUp(event: OutboxEvent): Promise<void> {
    const payload = event.payload;
    const { sellerOrderId, channelId, pickupProofUrl, pickedUpAt } = payload;

    this.logger.log(
      `Processing DELIVERY_PICKED_UP_V1 for seller order ${sellerOrderId}`,
    );

    // Notify Vendure via webhook
    await this.webhookService.emitDeliveryPickedUp({
      sellerOrderId,
      channelId,
      pickupProofUrl,
      pickedUpAt: pickedUpAt || new Date().toISOString(),
    });
  }

  private async handleDeliveryDroppedOff(event: OutboxEvent): Promise<void> {
    const payload = event.payload;
    const { sellerOrderId, channelId, deliveryProofUrl, deliveredAt } = payload;

    this.logger.log(
      `Processing DELIVERY_DROPPED_OFF_V1 for seller order ${sellerOrderId}`,
    );

    // Notify Vendure via webhook
    await this.webhookService.emitDeliveryDelivered({
      sellerOrderId,
      channelId,
      deliveryProofUrl,
      deliveredAt: deliveredAt || new Date().toISOString(),
    });
  }

  private async handleProofAccepted(event: OutboxEvent): Promise<void> {
    const payload = event.payload;
    const { sellerOrderId, channelId, proofType, deliveryProofUrl } = payload;

    this.logger.log(
      `Processing PROOF_ACCEPTED_V1 for seller order ${sellerOrderId}, proofType: ${proofType}`,
    );

    // Notify Vendure via webhook - simplified for now
    await this.webhookService.emitDeliveryDelivered({
      sellerOrderId,
      channelId,
      deliveryProofUrl,
      deliveredAt: new Date().toISOString(),
    });
  }

  private async handleDeliveryPickupConfirmed(event: OutboxEvent): Promise<void> {
    const payload = event.payload;
    const { sellerOrderId, channelId } = payload;

    this.logger.log(
      `Processing DELIVERY_PICKUP_CONFIRMED_V1 for seller order ${sellerOrderId}`,
    );

    // For now, treat pickup confirmed as picked up
    await this.webhookService.emitDeliveryPickedUp({
      sellerOrderId,
      channelId,
      pickupProofUrl: payload.pickupProofUrl,
      pickedUpAt: payload.pickedUpAt || new Date().toISOString(),
    });
  }

  private async handleDeliveryDropoffConfirmed(event: OutboxEvent): Promise<void> {
    const payload = event.payload;
    const { sellerOrderId, channelId } = payload;

    this.logger.log(
      `Processing DELIVERY_DROPOFF_CONFIRMED_V1 for seller order ${sellerOrderId}`,
    );

    // For now, treat dropoff confirmed as delivered
    await this.webhookService.emitDeliveryDelivered({
      sellerOrderId,
      channelId,
      deliveryProofUrl: payload.deliveryProofUrl,
      deliveredAt: payload.deliveredAt || new Date().toISOString(),
    });
  }

  private async handleDeliveryFailed(event: OutboxEvent): Promise<void> {
    const payload = event.payload;
    const { sellerOrderId, channelId, reason } = payload;

    this.logger.log(
      `Processing DELIVERY_FAILED_V1 for seller order ${sellerOrderId}, reason: ${reason}`,
    );

    // Notify Vendure via webhook
    await this.webhookService.emitDeliveryFailed({
      sellerOrderId,
      channelId,
      failure: {
        code: "DELIVERY_FAILED",
        reason: reason || "Unknown failure",
        occurredAt: payload.failedAt || new Date().toISOString(),
      },
    });
  }

  private async handleDeliveryCancelled(event: OutboxEvent): Promise<void> {
    const payload = event.payload;
    const { sellerOrderId, channelId, reason } = payload;

    this.logger.log(
      `Processing DELIVERY_CANCELLED_V1 for seller order ${sellerOrderId}, reason: ${reason}`,
    );

    // Notify Vendure via webhook
    await this.webhookService.emitDeliveryCancelled({
      sellerOrderId,
      channelId,
      reason,
    });
  }
}
