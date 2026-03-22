import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { HandlerRegistry } from "./handlers/handler.registry";
import { DeliveryAssignedHandler } from "./handlers/delivery-assigned.handler";
import { DeliveryCancelledHandler } from "./handlers/delivery-cancelled.handler";
import { DeliveryStatusForwardingHandler } from "./handlers/delivery-status-forwarding.handler"; // NEW
import { DriverLocationUpdatedHandler } from "./handlers/driver-location-updated.handler";

/**
 * src/domain-events/domain-events.startup.service.ts
 *
 * CRITICAL-4 FIX: The following event types were published to the outbox but
 * had no registered handlers. The outbox worker threw "No handler registered"
 * on every process tick, retried each row 10 times, and permanently failed:
 *
 *   DELIVERY_PICKUP_CONFIRMED_V1  (all V1/V2/V3 variants)
 *   DELIVERY_DROPOFF_CONFIRMED_V1 (all V1/V2/V3 variants)
 *   DELIVERY_FAILED_V1            (all V1/V2/V3 variants)
 *   PROOF_ACCEPTED_V1             (all V1/V2/V3 variants)
 *
 * All are now registered to DeliveryStatusForwardingHandler.
 */
@Injectable()
export class DomainEventsStartupService implements OnModuleInit {
  private readonly logger = new Logger(DomainEventsStartupService.name);

  constructor(
    private handlerRegistry: HandlerRegistry,
    private deliveryAssignedHandler: DeliveryAssignedHandler,
    private deliveryCancelledHandler: DeliveryCancelledHandler,
    private deliveryStatusForwardingHandler: DeliveryStatusForwardingHandler, // NEW
    private driverLocationUpdatedHandler: DriverLocationUpdatedHandler,
  ) {}

  onModuleInit() {
    this.registerHandlers();
    this.validateHandlers();
  }

  private registerHandlers(): void {
    // ── Assignment ────────────────────────────────────────────────────────────
    this.handlerRegistry.register(
      "DELIVERY_ASSIGNED_V1",
      this.deliveryAssignedHandler,
    );
    this.handlerRegistry.register(
      "DELIVERY_ASSIGNED_V2",
      this.deliveryAssignedHandler,
    );
    this.handlerRegistry.register(
      "DELIVERY_ASSIGNED_V3",
      this.deliveryAssignedHandler,
    );

    // ── Cancellation ──────────────────────────────────────────────────────────
    this.handlerRegistry.register(
      "DELIVERY_CANCELLED_V1",
      this.deliveryCancelledHandler,
    );

    // ── Status forwarding (was completely missing — CRITICAL-4 fix) ──────────
    // Pickup confirmed
    this.handlerRegistry.register(
      "DELIVERY_PICKUP_CONFIRMED_V1",
      this.deliveryStatusForwardingHandler,
    );
    this.handlerRegistry.register(
      "DELIVERY_PICKUP_CONFIRMED_V2",
      this.deliveryStatusForwardingHandler,
    );
    this.handlerRegistry.register(
      "DELIVERY_PICKUP_CONFIRMED_V3",
      this.deliveryStatusForwardingHandler,
    );

    // Dropoff confirmed
    this.handlerRegistry.register(
      "DELIVERY_DROPOFF_CONFIRMED_V1",
      this.deliveryStatusForwardingHandler,
    );
    this.handlerRegistry.register(
      "DELIVERY_DROPOFF_CONFIRMED_V2",
      this.deliveryStatusForwardingHandler,
    );
    this.handlerRegistry.register(
      "DELIVERY_DROPOFF_CONFIRMED_V3",
      this.deliveryStatusForwardingHandler,
    );

    // Failed
    this.handlerRegistry.register(
      "DELIVERY_FAILED_V1",
      this.deliveryStatusForwardingHandler,
    );
    this.handlerRegistry.register(
      "DELIVERY_FAILED_V2",
      this.deliveryStatusForwardingHandler,
    );
    this.handlerRegistry.register(
      "DELIVERY_FAILED_V3",
      this.deliveryStatusForwardingHandler,
    );

    // Proof accepted (driver-facing WebSocket confirmation)
    this.handlerRegistry.register(
      "PROOF_ACCEPTED_V1",
      this.deliveryStatusForwardingHandler,
    );
    this.handlerRegistry.register(
      "PROOF_ACCEPTED_V2",
      this.deliveryStatusForwardingHandler,
    );
    this.handlerRegistry.register(
      "PROOF_ACCEPTED_V3",
      this.deliveryStatusForwardingHandler,
    );

    // ── Driver location updates (Priority 3 fix) ───────────────────────────────
    this.handlerRegistry.register(
      "DRIVER_LOCATION_UPDATED_V1",
      this.driverLocationUpdatedHandler,
    );

    this.logger.log("All event handlers registered");
  }

  private validateHandlers(): void {
    const required = [
      "DELIVERY_ASSIGNED_V1",
      "DELIVERY_ASSIGNED_V2",
      "DELIVERY_ASSIGNED_V3",
      "DELIVERY_CANCELLED_V1",
      "DELIVERY_PICKUP_CONFIRMED_V1",
      "DELIVERY_DROPOFF_CONFIRMED_V1",
      "DELIVERY_FAILED_V1",
      "PROOF_ACCEPTED_V1",
      "DRIVER_LOCATION_UPDATED_V1",
    ];

    try {
      this.handlerRegistry.validateHandlers(required);
      const stats = this.handlerRegistry.getStats();
      this.logger.log(
        `Handler registry: ${stats.handlerCount} handlers covering ${stats.eventTypes.length} event types`,
      );
    } catch (error) {
      this.logger.error(
        `Handler validation failed: ${(error as Error).message}`,
      );
      throw error;
    }
  }
}
