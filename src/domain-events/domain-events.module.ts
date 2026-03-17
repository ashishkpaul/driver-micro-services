import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { OutboxEvent } from "./outbox.entity";
import { OutboxService } from "./outbox.service";
import { OutboxWorker } from "./outbox.worker";

import { WebSocketModule } from "../websocket/websocket.module";
import { WebhooksModule } from "../webhooks/webhooks.module";
import { PushModule } from "../push/push.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([OutboxEvent]),
    forwardRef(() => WebSocketModule),
    WebhooksModule,
    PushModule,
  ],
  providers: [OutboxService, OutboxWorker],
  exports: [OutboxService],
})
export class DomainEventsModule {}
