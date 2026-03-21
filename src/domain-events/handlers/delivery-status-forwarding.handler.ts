import { Injectable, Logger } from '@nestjs/common';
import { WebhooksService } from '../../webhooks/webhooks.service';
import { WebSocketService } from '../../websocket/websocket.service';
import { EventHandler } from './base.handler';
import { OutboxEvent } from '../outbox.entity';

/**
 * src/domain-events/handlers/delivery-status-forwarding.handler.ts
 *
 * CRITICAL-4 FIX: Several event types were published to the outbox but had
 * no registered handler. The outbox worker threw "No handler registered for
 * event type: DELIVERY_PICKUP_CONFIRMED_V1" (and similar), retried 10 times,
 * and permanently failed. Drivers never received proof confirmation.
 * PICKED_UP and DELIVERED status changes were silently lost.
 *
 * Unhandled types before this fix:
 *   DELIVERY_PICKUP_CONFIRMED_V1  — publishd from updateStatusInternal (PICKED_UP)
 *   DELIVERY_DROPOFF_CONFIRMED_V1 — published from verifyOtp + updateStatusInternal (DELIVERED)
 *   DELIVERY_FAILED_V1            — published from updateStatusInternal (FAILED)
 *   PROOF_ACCEPTED_V1             — published from verifyOtp
 *
 * Responsibility: forward each event to Vendure via webhooksService and
 * notify the driver over WebSocket where applicable. Mirrors the pattern
 * established by DeliveryAssignedHandler.
 */
@Injectable()
export class DeliveryStatusForwardingHandler implements EventHandler {
  private readonly logger = new Logger(DeliveryStatusForwardingHandler.name);

  constructor(
    private readonly webhooksService: WebhooksService,
    private readonly wsService: WebSocketService,
  ) {}

  async handle(event: OutboxEvent): Promise<void> {
    if (!event.eventType) {
      throw new Error(`Missing eventType for outbox event ${event.id}`);
    }

    this.logger.debug(
      `Forwarding status event ${event.eventType} (id=${event.id})`,
    );

    switch (event.eventType) {
      case 'DELIVERY_PICKUP_CONFIRMED_V1':
      case 'DELIVERY_PICKUP_CONFIRMED_V2':
      case 'DELIVERY_PICKUP_CONFIRMED_V3':
        await this.handlePickedUp(event);
        break;

      case 'DELIVERY_DROPOFF_CONFIRMED_V1':
      case 'DELIVERY_DROPOFF_CONFIRMED_V2':
      case 'DELIVERY_DROPOFF_CONFIRMED_V3':
        await this.handleDelivered(event);
        break;

      case 'DELIVERY_FAILED_V1':
      case 'DELIVERY_FAILED_V2':
      case 'DELIVERY_FAILED_V3':
        await this.handleFailed(event);
        break;

      case 'PROOF_ACCEPTED_V1':
      case 'PROOF_ACCEPTED_V2':
      case 'PROOF_ACCEPTED_V3':
        await this.handleProofAccepted(event);
        break;

      default:
        throw new Error(
          `DeliveryStatusForwardingHandler received unexpected event type: ${event.eventType}`,
        );
    }
  }

  // ── Handlers ───────────────────────────────────────────────────────────────

  private async handlePickedUp(event: OutboxEvent): Promise<void> {
    const { sellerOrderId, channelId, pickupProofUrl, pickedUpAt } = event.payload ?? {};

    if (!sellerOrderId || !channelId) {
      throw new Error(
        `DELIVERY_PICKUP_CONFIRMED payload missing sellerOrderId/channelId (event ${event.id})`,
      );
    }

    await this.webhooksService.emitDeliveryPickedUp({
      sellerOrderId,
      channelId,
      pickupProofUrl: pickupProofUrl ?? '',
      pickedUpAt: pickedUpAt ?? new Date().toISOString(),
    });

    this.logger.log(`Forwarded PICKUP_CONFIRMED to Vendure for order ${sellerOrderId}`);
  }

  private async handleDelivered(event: OutboxEvent): Promise<void> {
    const { sellerOrderId, channelId, deliveryProofUrl, deliveredAt } = event.payload ?? {};

    if (!sellerOrderId || !channelId) {
      throw new Error(
        `DELIVERY_DROPOFF_CONFIRMED payload missing sellerOrderId/channelId (event ${event.id})`,
      );
    }

    await this.webhooksService.emitDeliveryDelivered({
      sellerOrderId,
      channelId,
      deliveryProofUrl: deliveryProofUrl ?? '',
      deliveredAt: deliveredAt ?? new Date().toISOString(),
    });

    this.logger.log(`Forwarded DROPOFF_CONFIRMED to Vendure for order ${sellerOrderId}`);
  }

  private async handleFailed(event: OutboxEvent): Promise<void> {
    const { sellerOrderId, channelId, failure } = event.payload ?? {};

    if (!sellerOrderId || !channelId) {
      throw new Error(
        `DELIVERY_FAILED payload missing sellerOrderId/channelId (event ${event.id})`,
      );
    }

    await this.webhooksService.emitDeliveryFailed({
      sellerOrderId,
      channelId,
      failure: {
        code:        failure?.code       ?? 'DELIVERY_FAILED',
        reason:      failure?.reason     ?? 'Unknown failure',
        occurredAt:  failure?.occurredAt ?? new Date().toISOString(),
      },
    });

    this.logger.log(`Forwarded DELIVERY_FAILED to Vendure for order ${sellerOrderId}`);
  }

  private async handleProofAccepted(event: OutboxEvent): Promise<void> {
    const { driverId, deliveryId, proofType, proofUrl } = event.payload ?? {};

    // PROOF_ACCEPTED is a driver-facing confirmation — notify via WebSocket.
    // It is NOT forwarded to Vendure (Vendure already knows from DROPOFF_CONFIRMED).
    if (driverId) {
      await this.wsService.emitProofAccepted(driverId, {
        deliveryId: deliveryId ?? '',
        proofType:  proofType  ?? 'unknown',
        proofUrl:   proofUrl   ?? '',
        acceptedAt: new Date().toISOString(),
      });
      this.logger.log(
        `Emitted PROOF_ACCEPTED_V1 to driver ${driverId} for delivery ${deliveryId}`,
      );
    } else {
      this.logger.warn(
        `PROOF_ACCEPTED event ${event.id} has no driverId — WebSocket notification skipped`,
      );
    }
  }
}
