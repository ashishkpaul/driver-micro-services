import { Module, forwardRef } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { Driver } from "./entities/driver.entity";
import { DriverStats } from "../delivery-intelligence/driver/driver-stats.entity";
import { Delivery } from "../deliveries/entities/delivery.entity";
import { DriversService } from "./drivers.service";
import { DriversController } from "./drivers.controller";
import { RedisModule } from "../redis/redis.module";
import { DriverCapabilityService } from "./driver-capability.service";
import { DriverStateService } from "./driver-state.service";
import { DriverRegistrationService } from "./driver-registration.service";
import { DispatchScoringModule } from "../dispatch-scoring/dispatch-scoring.module";
import { DomainEventsModule } from "../domain-events/domain-events.module";
import { ServicesModule } from "../services/services.module";

@Module({
  imports: [
    TypeOrmModule.forFeature([Driver, DriverStats, Delivery]),
    RedisModule,
    DispatchScoringModule,
    forwardRef(() => DomainEventsModule),
    ServicesModule,
  ],
  controllers: [DriversController],
  providers: [
    DriversService,
    DriverCapabilityService,
    DriverStateService,
    DriverRegistrationService,
  ],
  exports: [
    DriversService,
    DriverCapabilityService,
    DriverStateService,
    DriverRegistrationService,
  ],
})
export class DriversModule {}
