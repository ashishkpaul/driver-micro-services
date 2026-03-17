import { Injectable, Logger } from "@nestjs/common";
import { EventHandler } from "./base.handler";
import { OutboxEvent } from "../outbox.entity";

@Injectable()
export class HandlerRegistry {
  private readonly logger = new Logger(HandlerRegistry.name);
  private handlers = new Map<string, EventHandler>();

  /**
   * Register a handler for a specific event type
   * @param eventType The event type to handle
   * @param handler The handler implementation
   */
  register(eventType: string, handler: EventHandler): void {
    this.handlers.set(eventType, handler);
    this.logger.log(`Registered handler for event type: ${eventType}`);
  }

  /**
   * Get a handler for a specific event type
   * @param eventType The event type to get handler for
   * @returns The handler or undefined if not found
   */
  getHandler(eventType: string): EventHandler | undefined {
    return this.handlers.get(eventType);
  }

  /**
   * Check if a handler exists for the given event type
   * @param eventType The event type to check
   * @returns True if handler exists, false otherwise
   */
  hasHandler(eventType: string): boolean {
    return this.handlers.has(eventType);
  }

  /**
   * Get all registered event types
   * @returns Array of registered event types
   */
  getRegisteredEventTypes(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Handle an outbox event by delegating to the appropriate handler
   * @param event The outbox event to process
   * @throws Error if no handler is registered for the event type
   */
  async handle(event: OutboxEvent): Promise<void> {
    const handler = this.handlers.get(event.eventType);

    if (!handler) {
      throw new Error(
        `No handler registered for event type: ${event.eventType}`,
      );
    }

    this.logger.debug(
      `Delegating event ${event.id} of type ${event.eventType} to handler`,
    );
    await handler.handle(event);
  }

  /**
   * Validate that all required event types have handlers registered
   * @param requiredEventTypes Array of event types that must have handlers
   * @throws Error if any required event type is missing a handler
   */
  validateHandlers(requiredEventTypes: string[]): void {
    const missingHandlers = requiredEventTypes.filter(
      (eventType) => !this.handlers.has(eventType),
    );

    if (missingHandlers.length > 0) {
      throw new Error(
        `Missing handlers for event types: ${missingHandlers.join(", ")}`,
      );
    }

    this.logger.log(
      `All required event types have handlers: ${requiredEventTypes.join(", ")}`,
    );
  }

  /**
   * Get statistics about registered handlers
   * @returns Object with handler count and event types
   */
  getStats(): { handlerCount: number; eventTypes: string[] } {
    return {
      handlerCount: this.handlers.size,
      eventTypes: this.getRegisteredEventTypes(),
    };
  }
}
