import { Injectable, Logger } from "@nestjs/common";
import { EventHandler } from "./base.handler";
import { OutboxEvent } from "../outbox.entity";

/**
 * Handles internal driver lifecycle events that are published to the outbox
 * but require no external side-effects (no webhook, no WS push).
 * Registering them prevents the OutboxWorker from failing with
 * "No handler registered for event type".
 */
@Injectable()
export class DriverLifecycleHandler implements EventHandler {
  private readonly logger = new Logger(DriverLifecycleHandler.name);

  async handle(event: OutboxEvent): Promise<void> {
    this.logger.log(`Driver lifecycle event processed: ${event.eventType} (id=${event.id})`);
  }
}
