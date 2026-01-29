// websocket/websocket.gateway.ts

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from '@nestjs/websockets';
import { UseGuards, Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';

import { WebSocketJwtGuard } from './websocket.guard';
import { WebSocketService } from './websocket.service';
import { DriversService } from '../drivers/drivers.service';
import { DeliveriesService } from '../deliveries/deliveries.service';

import {
  LocationUpdateEvent,
  ProofUploadedEvent,
  DriverStatusEvent,
} from './interfaces/websocket.interface';

import { handleLocationUpdate } from './events/location.handler';
import { handleProofUploaded } from './events/proof.handler';
import { handleDriverStatus } from './events/delivery.handler';

@WebSocketGateway({
  namespace: '/driver',
  cors: { origin: true, credentials: true },
})
@UseGuards(WebSocketJwtGuard)
export class WebSocketGatewayHandler
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(WebSocketGatewayHandler.name);

  constructor(
    private readonly wsService: WebSocketService,
    private readonly driversService: DriversService,
    private readonly deliveriesService: DeliveriesService,
  ) {}

  afterInit(server: Server) {
    this.wsService.bindServer(server);
  }

  async handleConnection(client: Socket) {
    const driverId = client.data.driverId;

    if (!driverId) {
      this.logger.warn('WS connection without driverId — disconnecting');
      client.disconnect();
      return;
    }

    client.join(`driver:${driverId}`);
    await this.driversService.updateStatus(driverId, 'AVAILABLE');

    this.logger.log(`Driver ${driverId} connected`);
  }

  async handleDisconnect(client: Socket) {
    const driverId = client.data.driverId;
    if (!driverId) return;

    setTimeout(async () => {
      const stillConnected = Array.from(this.server.sockets.sockets.values())
        .some(s => s.data?.driverId === driverId);

      if (!stillConnected) {
        await this.driversService.updateStatus(driverId, 'OFFLINE');
        this.logger.log(`Driver ${driverId} marked OFFLINE`);
      }
    }, 30_000);
  }

  @SubscribeMessage('LOCATION_UPDATE_V1')
  handleLocation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: LocationUpdateEvent,
  ) {
    return handleLocationUpdate(client, data, this.driversService);
  }

  @SubscribeMessage('PROOF_UPLOADED_V1')
  handleProof(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: ProofUploadedEvent,
  ) {
    return handleProofUploaded(client, data, this.deliveriesService);
  }

  @SubscribeMessage('DRIVER_STATUS_V1')
  handleStatus(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: DriverStatusEvent,
  ) {
    return handleDriverStatus(client, data, this.driversService);
  }

  @SubscribeMessage('PING_V1')
  handlePing() {
    return {
      timestamp: Date.now(),
      status: 'ok',
    };
  }
}
