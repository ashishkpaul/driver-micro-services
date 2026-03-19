import { Module } from "@nestjs/common";
import { EventsController } from "./events.controller";
import { RedisModule } from "../redis/redis.module";
import { DeliveriesModule } from "../deliveries/deliveries.module"; // ADDED
import { DriversModule } from "../drivers/drivers.module"; // ADDED
import { OffersModule } from "../offers/offers.module"; // ADDED

@Module({
  imports: [RedisModule, DeliveriesModule, DriversModule, OffersModule],
  controllers: [EventsController],
  providers: [],
  exports: [],
})
export class EventsModule {}
