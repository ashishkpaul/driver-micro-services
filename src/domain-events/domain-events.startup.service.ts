import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { HandlerRegistry } from "./handlers/handler.registry";
import { DeliveryAssignedHandler } from "./handlers/delivery-assigned.handler";
import { DeliveryCancelledHandler } from "./handlers/delivery-cancelled.handler";

@Injectable()
export class DomainEventsStartupService implements OnModuleInit {
  private readonly logger = new Logger(DomainEventsStartupService.name);

  constructor(
    private handlerRegistry: HandlerRegistry,
    private deliveryAssignedHandler: DeliveryAssignedHandler,
    private deliveryCancelledHandler: DeliveryCancelledHandler,
  ) {}

  onModuleInit() {
    this.registerHandlers();
    this.validateHandlers();
  }

  private registerHandlers(): void {
    // Register all event handlers
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

    this.handlerRegistry.register(
      "DELIVERY_CANCELLED_V1",
      this.deliveryCancelledHandler,
    );

    this.logger.log("All event handlers registered successfully");
  }

  private validateHandlers(): void {
    try {
      // Define all required event types
      const requiredEventTypes = [
        "DELIVERY_ASSIGNED_V1",
        "DELIVERY_ASSIGNED_V2",
        "DELIVERY_ASSIGNED_V3",
        "DELIVERY_CANCELLED_V1",
      ];

      // Validate that all required handlers are registered
      this.handlerRegistry.validateHandlers(requiredEventTypes);

      // Log statistics
      const stats = this.handlerRegistry.getStats();
      this.logger.log(
        `Handler registry initialized with ${stats.handlerCount} handlers for event types: ${stats.eventTypes.join(", ")}`,
      );
    } catch (error) {
      this.logger.error(`Handler validation failed: ${error.message}`);
      throw error;
    }
  }
}
