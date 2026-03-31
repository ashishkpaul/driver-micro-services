import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { BootstrapModule } from "../bootstrap/bootstrap.module";

import { OutboxEvent } from "./outbox.entity";
import { OutboxArchiveEvent } from "./outbox-archive.entity";
import { IdempotencyTracker } from "./idempotency-tracker.entity";

import { OutboxService } from "./outbox.service";
import { OutboxJanitorService } from "./outbox-janitor.service";
import { MetricsService } from "./metrics.service";
import { CircuitBreakerService } from "./circuit-breaker.service";
import { WorkerLifecycleService } from "./worker-lifecycle.service";
import { AdaptiveBatchService } from "./adaptive-batch.service";
import { HandlerRegistry } from "./handlers/handler.registry";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      OutboxEvent,
      OutboxArchiveEvent,
      IdempotencyTracker,
    ]),
    BootstrapModule,
  ],

  providers: [
    OutboxService,
    OutboxJanitorService,
    MetricsService,
    CircuitBreakerService,
    WorkerLifecycleService,
    AdaptiveBatchService,
    HandlerRegistry,
  ],

  exports: [
    TypeOrmModule,
    OutboxService,
    OutboxJanitorService,
    MetricsService,
    CircuitBreakerService,
    WorkerLifecycleService,
    AdaptiveBatchService,
    HandlerRegistry,
  ],
})
export class DomainEventsCoreModule {}
