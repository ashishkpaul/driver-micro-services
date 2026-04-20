// src/websocket/websocket.module.ts

import { Module, Global, forwardRef } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";

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
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>("JWT_SECRET") || "driver-service-secret",
      }),
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
  ],
  exports: [WebSocketService, WebSocketMetricsService],
})
export class WebSocketModule {}
