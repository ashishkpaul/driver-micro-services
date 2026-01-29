// websocket/websocket.module.ts

import { Module, Global } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';

import { WebSocketGatewayHandler } from './websocket.gateway';
import { WebSocketService } from './websocket.service';
import { WebSocketJwtGuard } from './websocket.guard';

import { DriversModule } from '../drivers/drivers.module';
import { DeliveriesModule } from '../deliveries/deliveries.module';

@Global()
@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'driver-service-secret',
    }),
    DriversModule,
    DeliveriesModule,
  ],
  providers: [
    WebSocketGatewayHandler,
    WebSocketService,
    WebSocketJwtGuard,
  ],
  exports: [WebSocketService],
})
export class WebSocketModule {}
