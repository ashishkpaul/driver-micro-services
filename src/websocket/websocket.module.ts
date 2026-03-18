// src/websocket/websocket.module.ts

import { Module, Global, forwardRef } from "@nestjs/common";
import { JwtModule, JwtService } from "@nestjs/jwt";

import { WebSocketGatewayHandler } from "./websocket.gateway";
import { WebSocketService } from "./websocket.service";
import { WebSocketJwtGuard } from "./websocket.guard";
import { WebSocketMetricsService } from "./websocket-metrics.service";
import { DriverRealtimeService } from "../realtime/driver-realtime.service";

import { DriversModule } from "../drivers/drivers.module";
import { RedisModule } from "../redis/redis.module";
import { DeliveriesModule } from "../deliveries/deliveries.module";
import { OffersModule } from "../offers/offers.module";

@Global()
@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || "driver-service-secret",
    }),
    DriversModule,
    forwardRef(() => DeliveriesModule),
    RedisModule,
    OffersModule,
  ],
  providers: [
    WebSocketGatewayHandler,
    WebSocketService,
    WebSocketJwtGuard,
    WebSocketMetricsService,
    DriverRealtimeService,
    JwtService,
  ],
  exports: [WebSocketService, WebSocketMetricsService],
})
export class WebSocketModule {}
