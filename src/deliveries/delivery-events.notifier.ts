// src/deliveries/delivery-events.notifier.ts

import { Injectable } from "@nestjs/common";
import { WebSocketService } from "../websocket/websocket.service";
import { Delivery } from "./entities/delivery.entity";
import { DeliveryEvent } from "./entities/delivery-event.entity";
import { OutboxService } from "../domain-events/outbox.service";

@Injectable()
export class DeliveryEventsNotifier {
  constructor(
    private readonly websocket: WebSocketService,
    private readonly outbox: OutboxService,
  ) {}

  async notify(event: DeliveryEvent, delivery: Delivery) {
    if (!delivery.driverId) return;

    if (event.eventType === "PICKED_UP") {
      // Use Outbox for WebSocket notifications
      await this.outbox.publish(
        null, // No transaction manager needed for WebSocket events
        "PROOF_ACCEPTED_V1",
        {
          driverId: delivery.driverId,
          deliveryId: delivery.id,
          proofId: event.id,
          proofType: "PICKUP",
          acceptedAt: event.createdAt.toISOString(),
        },
      );
    }

    if (event.eventType === "DELIVERED") {
      // Use Outbox for WebSocket notifications
      await this.outbox.publish(
        null, // No transaction manager needed for WebSocket events
        "PROOF_ACCEPTED_V1",
        {
          driverId: delivery.driverId,
          deliveryId: delivery.id,
          proofId: event.id,
          proofType: "DROPOFF",
          acceptedAt: event.createdAt.toISOString(),
        },
      );
    }
  }
}
