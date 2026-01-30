// src/websocket/websocket.module.ts

import { Module, Global } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { WebSocketGatewayHandler } from './websocket.gateway';
import { WebSocketService } from './websocket.service';
import { WebSocketJwtGuard } from './websocket.guard';
import { WebSocketMetricsService } from './websocket-metrics.service';

import { DriversModule } from '../drivers/drivers.module';
import { RedisModule } from '../redis/redis.module';
import { DeliveriesModule } from '../deliveries/deliveries.module';

@Global()
@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'driver-service-secret',
    }),
    DriversModule,
    DeliveriesModule,
    RedisModule,
  ],
  providers: [
    WebSocketGatewayHandler,
    WebSocketService,
    WebSocketJwtGuard,
    WebSocketMetricsService,
  ],
  exports: [
    WebSocketService,
    WebSocketMetricsService,
  ],
})
export class WebSocketModule {}
