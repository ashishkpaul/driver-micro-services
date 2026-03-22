// ─────────────────────────────────────────────────────────────────────────────
// src/domain-events/domain-events.module.ts  — updated
//
// CHANGE: Add DeliveryStatusForwardingHandler to providers in both
// DomainEventsModule and DomainEventsApiModule.
// ─────────────────────────────────────────────────────────────────────────────

import { Module } from "@nestjs/common";
import { OutboxWorker } from "./outbox.worker";
import { HandlerRegistry } from "./handlers/handler.registry";
import { DeliveryAssignedHandler } from "./handlers/delivery-assigned.handler";
import { DeliveryCancelledHandler } from "./handlers/delivery-cancelled.handler";
import { DeliveryStatusForwardingHandler } from "./handlers/delivery-status-forwarding.handler";
import { DriverLocationUpdatedHandler } from "./handlers/driver-location-updated.handler";
import { DomainEventsStartupService } from "./domain-events.startup.service";

import { WebhooksModule } from "../webhooks/webhooks.module";
import { PushModule } from "../push/push.module";
import { RedisModule } from "../redis/redis.module"; // ADDED
import { DriversModule } from "../drivers/drivers.module"; // LIKELY NEEDED
import { DomainEventsCoreModule } from "./domain-events-core.module";

@Module({
  imports: [
    DomainEventsCoreModule, 
    WebhooksModule, 
    PushModule, 
    RedisModule, // ADDED
    DriversModule // ADDED (prevents potential next error)
  ],
  providers: [
    OutboxWorker,
    DomainEventsStartupService,
    HandlerRegistry,
    DeliveryAssignedHandler,
    DeliveryCancelledHandler,
    DeliveryStatusForwardingHandler,
    DriverLocationUpdatedHandler
  ],
  exports: [
    DomainEventsCoreModule, 
  ],
})
export class DomainEventsModule {}

@Module({
  imports: [
    DomainEventsCoreModule, 
    WebhooksModule, 
    PushModule, 
    RedisModule, // ADDED
    DriversModule // ADDED
  ],
  providers: [
    HandlerRegistry,
    DeliveryAssignedHandler,
    DeliveryCancelledHandler,
    DeliveryStatusForwardingHandler,
    DriverLocationUpdatedHandler
  ],
  exports: [DomainEventsCoreModule],
})
export class DomainEventsApiModule {}
