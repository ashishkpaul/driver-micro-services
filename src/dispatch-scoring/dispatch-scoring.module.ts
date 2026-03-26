import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { DispatchScoringService } from "./dispatch-scoring.service";
import { DispatchConfigService } from "./dispatch-config.service";
import { DispatchScore } from "./entities/dispatch-score.entity";
import { DispatchConfig } from "./entities/dispatch-config.entity";
import { DriverStatsModule } from "../delivery-intelligence/driver/driver-stats.module";
import { DeliveryMetricsModule } from "../delivery-intelligence/delivery/delivery-metrics.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([DispatchScore, DispatchConfig]),
    DriverStatsModule,
    DeliveryMetricsModule,
  ],
  providers: [DispatchScoringService, DispatchConfigService],
  exports: [DispatchScoringService, DispatchConfigService],
})
export class DispatchScoringModule {}