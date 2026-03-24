import { Module, Global } from '@nestjs/common';
import { SystemReadinessService } from './system-readiness.service';
import { FeatureStatusService } from './feature-status.service';
import { BootPhaseLogger } from './boot-phase.logger';

@Global()
@Module({
  providers: [SystemReadinessService, FeatureStatusService, BootPhaseLogger],
  exports: [SystemReadinessService, FeatureStatusService, BootPhaseLogger],
})
export class BootstrapModule {}
