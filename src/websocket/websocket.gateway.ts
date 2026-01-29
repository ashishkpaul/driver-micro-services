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
import { WebSocketMetricsService } from './websocket-metrics.service';

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
    private readonly metrics: WebSocketMetricsService,
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
    // Fire-and-forget metrics to prevent Redis stalls from blocking connections
    this.metrics.onConnect(driverId).catch(() => {});
    await this.driversService.updateStatus(driverId, 'AVAILABLE');

    this.logger.log(`Driver ${driverId} connected`);
  }

  async handleDisconnect(client: Socket) {
    const driverId = client.data.driverId;
    if (!driverId) return;

    // Fire-and-forget metrics to prevent Redis stalls from blocking disconnections
    this.metrics.onDisconnect(driverId).catch(() => {});

    // Delay OFFLINE status update to handle reconnection scenarios
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
  async handleLocation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: LocationUpdateEvent,
  ) {
    const driverId = client.data.driverId;
    if (driverId) {
      // Fire-and-forget metrics to prevent Redis stalls from blocking message handling
      this.metrics.messageReceived(driverId).catch(() => {});
    }
    return handleLocationUpdate(client, data, this.driversService);
  }

  @SubscribeMessage('PROOF_UPLOADED_V1')
  async handleProof(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: ProofUploadedEvent,
  ) {
    const driverId = client.data.driverId;
    if (driverId) {
      // Fire-and-forget metrics to prevent Redis stalls from blocking message handling
      this.metrics.messageReceived(driverId).catch(() => {});
    }
    return handleProofUploaded(client, data, this.deliveriesService);
  }

  @SubscribeMessage('DRIVER_STATUS_V1')
  async handleStatus(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: DriverStatusEvent,
  ) {
    const driverId = client.data.driverId;
    if (driverId) {
      // Fire-and-forget metrics to prevent Redis stalls from blocking message handling
      this.metrics.messageReceived(driverId).catch(() => {});
    }
    return handleDriverStatus(client, data, this.driversService);
  }

  @SubscribeMessage('PING_V1')
  async handlePing(@ConnectedSocket() client: Socket) {
    const driverId = client.data.driverId;
    if (driverId) {
      // Fire-and-forget metrics to prevent Redis stalls from blocking message handling
      this.metrics.messageReceived(driverId).catch(() => {});
    }
    
    return {
      timestamp: Date.now(),
      status: 'ok',
    };
  }
}
