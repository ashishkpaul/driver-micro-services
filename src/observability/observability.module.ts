import { Module } from '@nestjs/common';
import { DbPoolLogger } from './db-pool.logger';

@Module({
  providers: [DbPoolLogger],
  exports: [DbPoolLogger],
})
export class ObservabilityModule {}
