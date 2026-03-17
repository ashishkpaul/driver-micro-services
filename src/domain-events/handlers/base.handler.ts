import { OutboxEvent } from "../outbox.entity";

export interface EventHandler {
  /**
   * Handle an outbox event
   * @param event The outbox event to process
   */
  handle(event: OutboxEvent): Promise<void>;
}
