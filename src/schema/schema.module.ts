import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ScheduleModule } from "@nestjs/schedule";
import { DomainEventsCoreModule } from "../domain-events/domain-events-core.module";
import { SchemaControlPlaneService } from "./services/schema-control-plane.service";
import { SchemaOrchestratorService } from "./services/schema-orchestrator.service";
import { SchemaSnapshotService } from "./services/schema-snapshot.service";
import { SchemaDiffService } from "./services/schema-diff.service";
import { SchemaClassificationService } from "./services/schema-classification.service";
import { SchemaLockService } from "./services/schema-lock.service";
import { IntentParserService } from "./services/intent-parser.service";
import { IntentTranslatorService } from "./services/intent-translator.service";
import { MigrationReadinessService } from "./services/migration-readiness.service";
import { DriftEngine } from "./engine/drift-engine";
import { DriftCacheService } from "./services/drift-cache.service";
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
