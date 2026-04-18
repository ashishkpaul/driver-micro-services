// src/deliveries/deliveries.module.ts

import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Delivery } from "./entities/delivery.entity";
import { DeliveryEvent } from "./entities/delivery-event.entity";
import { DeliveriesService } from "./deliveries.service";
import { DeliveriesController } from "./deliveries.controller";
import { WebhooksModule } from "../webhooks/webhooks.module";
import { DeliveryEventsNotifier } from "./delivery-events.notifier";
import { DeliveryAuthorizationService } from "./delivery-authorization.service";
import { DeliveryStateMachine } from "./delivery-state-machine.service";
import { SlaMonitorService } from "./sla-monitor.service";
import { RedisModule } from "../redis/redis.module";
import { DomainEventsModule } from "../domain-events/domain-events.module";
import { ServicesModule } from "../services/services.module";
import { DeliveryIntelligenceModule } from "../delivery-intelligence/delivery-intelligence.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([Delivery, DeliveryEvent]),
    WebhooksModule,
    RedisModule,
    forwardRef(() => DomainEventsModule),
    ServicesModule,
    DeliveryIntelligenceModule,
    // 🚫 DO NOT import WebSocketModule
  ],
  controllers: [DeliveriesController],
  providers: [
    DeliveriesService,
    DeliveryEventsNotifier,
    DeliveryAuthorizationService,
    DeliveryStateMachine,
    SlaMonitorService,
  ],
  exports: [DeliveriesService, DeliveryAuthorizationService, TypeOrmModule],
})
export class DeliveriesModule {}
