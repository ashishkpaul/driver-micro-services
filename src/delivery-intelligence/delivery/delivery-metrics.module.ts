import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DeliveryMetrics } from './delivery-metrics.entity';
import { DeliveryMetricsService } from './delivery-metrics.service';

@Module({
  imports: [TypeOrmModule.forFeature([DeliveryMetrics])],
  providers: [DeliveryMetricsService],
  exports: [DeliveryMetricsService],
})
export class DeliveryMetricsModule {}