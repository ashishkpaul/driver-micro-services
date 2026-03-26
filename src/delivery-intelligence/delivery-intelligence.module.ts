import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DriverStatsModule } from './driver/driver-stats.module';
import { DeliveryMetricsModule } from './delivery/delivery-metrics.module';
import { DeliveryMetricsController } from './delivery/delivery-metrics.controller';
import { DeliveryHealthService } from './delivery/delivery-health.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([]), // Add any shared entities here
    DriverStatsModule,
    DeliveryMetricsModule,
  ],
  controllers: [DeliveryMetricsController],
  providers: [DeliveryHealthService],
  exports: [
    DriverStatsModule,
    DeliveryMetricsModule,
    DeliveryHealthService,
  ],
})
export class DeliveryIntelligenceModule {}
