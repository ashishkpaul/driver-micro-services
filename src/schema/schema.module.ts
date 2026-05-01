import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ScheduleModule } from "@nestjs/schedule";
import { DomainEventsCoreModule } from "../domain-events/domain-events-core.module";
import { SchemaControlPlaneService } from "./shared/schema-control-plane.service";
import { SchemaOrchestratorService } from "./shared/schema-orchestrator.service";
import { SchemaSnapshotService } from "./shared/schema-snapshot.service";
import { SchemaDiffService } from "./shared/schema-diff.service";
import { SchemaClassificationService } from "./shared/schema-classification.service";
import { SchemaLockService } from "./shared/schema-lock.service";
import { IntentParserService } from "./shared/intent-parser.service";
import { IntentTranslatorService } from "./shared/intent-translator.service";
import { MigrationReadinessService } from "./shared/migration-readiness.service";
import { DriftEngine } from "./engine/drift-engine";
import { DriftCacheService } from "./shared/drift-cache.service";
import { BackgroundBackfillWorker } from "./workers/backfill.worker";
import { BackfillJob } from "./entities/backfill-job.entity";
import { SchemaDifference } from "./entities/schema-difference.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([BackfillJob, SchemaDifference]),
    ScheduleModule.forRoot(),
    DomainEventsCoreModule,
  ],
  providers: [
    SchemaControlPlaneService,
    SchemaOrchestratorService,
    SchemaSnapshotService,
    SchemaDiffService,
    SchemaClassificationService,
    SchemaLockService,
    IntentParserService,
    IntentTranslatorService,
    MigrationReadinessService,
    DriftEngine,
    DriftCacheService,
    BackgroundBackfillWorker,
  ],
  exports: [
    SchemaControlPlaneService,
    SchemaOrchestratorService,
    SchemaSnapshotService,
    SchemaDiffService,
    SchemaClassificationService,
    SchemaLockService,
    IntentParserService,
    IntentTranslatorService,
    MigrationReadinessService,
    DriftCacheService,
    BackgroundBackfillWorker,
  ],
})
export class SchemaModule {}
