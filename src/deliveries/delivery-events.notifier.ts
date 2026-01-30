// src/deliveries/delivery-events.notifier.ts

import { Injectable } from '@nestjs/common';
import { WebSocketService } from '../websocket/websocket.service';
import { Delivery } from './entities/delivery.entity';
import { DeliveryEvent } from './entities/delivery-event.entity';

@Injectable()
export class DeliveryEventsNotifier {
  constructor(
    private readonly websocket: WebSocketService,
  ) {}

  async notify(event: DeliveryEvent, delivery: Delivery) {
    if (!delivery.driverId) return;

    if (event.eventType === 'PICKED_UP') {
      await this.websocket.emitProofAccepted(delivery.driverId, {
        deliveryId: delivery.id,
        proofId: event.id,
        proofType: 'PICKUP',
        acceptedAt: event.createdAt.toISOString(),
      });
    }

    if (event.eventType === 'DELIVERED') {
      await this.websocket.emitProofAccepted(delivery.driverId, {
        deliveryId: delivery.id,
        proofId: event.id,
        proofType: 'DELIVERY',
        acceptedAt: event.createdAt.toISOString(),
      });
    }
  }
}
