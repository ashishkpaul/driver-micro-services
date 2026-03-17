import { Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { OutboxEvent } from "./outbox.entity";
import { WebSocketService } from "../websocket/websocket.service";
import { WebhooksService } from "../webhooks/webhooks.service";
import { PushNotificationService } from "../push/push.service";

@Injectable()
export class OutboxWorker {
  private readonly logger = new Logger(OutboxWorker.name);

  constructor(
    @InjectRepository(OutboxEvent)
    private outboxRepository: Repository<OutboxEvent>,
    private wsService: WebSocketService,
    private vendureSyncService: WebhooksService,
    private pushService: PushNotificationService,
  ) {}

  @Cron("*/5 * * * * *")
  async process() {
    const events = await this.outboxRepository.find({
      where: { status: "PENDING" },
      take: 50,
    });

    for (const event of events) {
      try {
        await this.handle(event);
        event.status = "DONE";
        event.processedAt = new Date();
        await this.outboxRepository.save(event);
      } catch (e) {
        this.logger.error(`Failed to process outbox event ${event.id}:`, e);
        event.status = "FAILED";
        await this.outboxRepository.save(event);
      }
    }
  }

  async handle(event: OutboxEvent) {
    switch (event.eventType) {
      case "DELIVERY_ASSIGNED":
        await this.wsService.emitDeliveryAssigned(
          event.payload.driverId,
          event.payload,
        );

        await this.vendureSyncService.emitDeliveryAssigned({
          sellerOrderId: event.payload.sellerOrderId,
          channelId: event.payload.channelId,
          driverId: event.payload.driverId,
          assignmentId: event.payload.assignmentId,
          assignedAt: new Date().toISOString(),
        });
        break;

      default:
        this.logger.warn(`Unknown outbox event type: ${event.eventType}`);
    }
  }
}
