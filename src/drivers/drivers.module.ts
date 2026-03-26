import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Driver } from "./entities/driver.entity";
import { DriverStats } from "../delivery-intelligence/driver/driver-stats.entity";
import { DriversService } from "./drivers.service";
import { DriversController } from "./drivers.controller";
import { RedisModule } from "../redis/redis.module";
import { DriverCapabilityService } from "./driver-capability.service";
import { DriverStateService } from "./driver-state.service";
import { DispatchScoringModule } from "../dispatch-scoring/dispatch-scoring.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([Driver, DriverStats]), 
    RedisModule,
    DispatchScoringModule
  ],
  controllers: [DriversController],
  providers: [DriversService, DriverCapabilityService, DriverStateService],
  exports: [DriversService, DriverCapabilityService, DriverStateService],
})
export class DriversModule {}
