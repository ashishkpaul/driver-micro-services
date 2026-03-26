import { Module } from "@nestjs/common";
import { EventsController } from "./events.controller";
import { RedisModule } from "../redis/redis.module";
import { DeliveriesModule } from "../deliveries/deliveries.module";
import { DriversModule } from "../drivers/drivers.module";
import { OffersModule } from "../offers/offers.module";
import { SafeDispatchModule } from "../safe-dispatch/safe-dispatch.module";

@Module({
  imports: [
    RedisModule, 
    DeliveriesModule, 
    DriversModule, 
    OffersModule, 
    SafeDispatchModule
  ],
  controllers: [EventsController],
  providers: [],
  exports: [],
})
export class EventsModule {}
