import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { ScheduleModule } from "@nestjs/schedule";
import { SchemaControlPlaneService } from "./services/schema-control-plane.service";
import { SchemaOrchestratorService } from "./services/schema-orchestrator.service";
import { SchemaSnapshotService } from "./services/schema-snapshot.service";
import { SchemaDiffService } from "./services/schema-diff.service";
import { SchemaClassificationService } from "./services/schema-classification.service";
import { SchemaLockService } from "./services/schema-lock.service";
import { BackgroundBackfillWorker } from "./workers/backfill.worker";
import { BackfillJob } from "./entities/backfill-job.entity";

@Module({
  imports: [
    TypeOrmModule.forFeature([BackfillJob]),
    ScheduleModule.forRoot(),
  ],
  providers: [
    SchemaControlPlaneService,
    SchemaOrchestratorService,
    SchemaSnapshotService,
    SchemaDiffService,
    SchemaClassificationService,
    SchemaLockService,
    BackgroundBackfillWorker,
  ],
  exports: [
    SchemaControlPlaneService,
    SchemaOrchestratorService,
    SchemaSnapshotService,
    SchemaDiffService,
    SchemaClassificationService,
    SchemaLockService,
    BackgroundBackfillWorker,
  ],
})
export class SchemaModule {}
