import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { OutboxEvent } from './outbox.entity';
import { OutboxArchiveEvent } from './outbox-archive.entity';
import { IdempotencyTracker } from './idempotency-tracker.entity';

import { OutboxService } from './outbox.service';
import { OutboxJanitorService } from './outbox-janitor.service';
import { MetricsService } from './metrics.service';
import { CircuitBreakerService } from './circuit-breaker.service';
import { WorkerLifecycleService } from './worker-lifecycle.service';
import { AdaptiveBatchService } from './adaptive-batch.service';

@Module({
  imports:[
    TypeOrmModule.forFeature([
      OutboxEvent,
      OutboxArchiveEvent,
      IdempotencyTracker
    ])
  ],

  providers:[
    OutboxService,
    OutboxJanitorService,
    MetricsService,
    CircuitBreakerService,
    WorkerLifecycleService,
    AdaptiveBatchService
  ],

  exports:[
    TypeOrmModule,
    OutboxService,
    OutboxJanitorService,
    MetricsService,
    CircuitBreakerService,
    WorkerLifecycleService,
    AdaptiveBatchService
  ]
})
export class DomainEventsCoreModule {}