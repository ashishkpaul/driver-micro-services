// src/deliveries/deliveries.module.ts

import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Delivery } from "./entities/delivery.entity";
import { DeliveryEvent } from "./entities/delivery-event.entity";
import { DeliveriesService } from "./deliveries.service";
import { DeliveriesController } from "./deliveries.controller";
import { WebhooksModule } from "../webhooks/webhooks.module";
import { DeliveryEventsNotifier } from "./delivery-events.notifier";

@Module({
  imports: [
    TypeOrmModule.forFeature([Delivery, DeliveryEvent]),
    WebhooksModule,
    // 🚫 DO NOT import WebSocketModule
  ],
  controllers: [DeliveriesController],
  providers: [
    DeliveriesService,
    DeliveryEventsNotifier,
  ],
  exports: [DeliveriesService],
})
export class DeliveriesModule {}
