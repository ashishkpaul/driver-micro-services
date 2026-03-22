// ─────────────────────────────────────────────────────────────────────────────
// src/domain-events/domain-events.module.ts  — updated
//
// CHANGE: Add DeliveryStatusForwardingHandler to providers in both
// DomainEventsModule and DomainEventsApiModule.
// ─────────────────────────────────────────────────────────────────────────────

import { Module, forwardRef } from '@nestjs/common';
import { OutboxService } from './outbox.service';
import { OutboxWorker } from './outbox.worker';
import { HandlerRegistry } from './handlers/handler.registry';
import { DeliveryAssignedHandler } from './handlers/delivery-assigned.handler';
import { DeliveryCancelledHandler } from './handlers/delivery-cancelled.handler';
import { DeliveryStatusForwardingHandler } from './handlers/delivery-status-forwarding.handler'; // NEW
import { DomainEventsStartupService } from './domain-events.startup.service';

import { WebSocketModule } from '../websocket/websocket.module';
import { WebhooksModule } from '../webhooks/webhooks.module';
import { PushModule } from '../push/push.module';
import { DomainEventsCoreModule } from './domain-events-core.module';

@Module({
  imports: [
    DomainEventsCoreModule,
    forwardRef(() => WebSocketModule),
    WebhooksModule,
    PushModule,
  ],
  providers: [
    OutboxWorker,
    DomainEventsStartupService,
    HandlerRegistry,
    DeliveryAssignedHandler,
    DeliveryCancelledHandler,
    DeliveryStatusForwardingHandler, // NEW
  ],
  exports: [DomainEventsCoreModule],
})
export class DomainEventsModule {}

@Module({
  imports: [
    DomainEventsCoreModule,
    forwardRef(() => WebSocketModule),
    WebhooksModule,
    PushModule,
  ],
  providers: [
    HandlerRegistry,
    DeliveryAssignedHandler,
    DeliveryCancelledHandler,
    DeliveryStatusForwardingHandler, // NEW
  ],
  exports: [DomainEventsCoreModule],
})
export class DomainEventsApiModule {}
