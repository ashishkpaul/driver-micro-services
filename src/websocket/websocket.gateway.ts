// websocket/websocket.gateway.ts

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
} from "@nestjs/websockets";
import { UseGuards, Logger } from "@nestjs/common";
import { Server, Socket } from "socket.io";

import { WebSocketJwtGuard } from "./websocket.guard";
import { WebSocketService } from "./websocket.service";
import { DriversService } from "../drivers/drivers.service";
import { DeliveriesService } from "../deliveries/deliveries.service";
import { OffersService } from "../offers/offers.service";

import {
  LocationUpdateEvent,
  ProofUploadedEvent,
  DriverStatusEvent,
} from "./interfaces/websocket.interface";

import { handleLocationUpdate } from "./events/location.handler";
import { handleProofUploaded } from "./events/proof.handler";
import { handleDriverStatus } from "./events/delivery.handler";
import { handleDriverHeartbeat } from "./events/presence.handler";
import { WebSocketMetricsService } from "./websocket-metrics.service";
import { DriverStatus } from "../drivers/enums/driver-status.enum";
import { RedisService } from "../redis/redis.service";
import { JwtService } from "@nestjs/jwt";

@WebSocketGateway({
  namespace: "/driver",
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
    private readonly offersService: OffersService,
    private readonly metrics: WebSocketMetricsService,
    private readonly redisService: RedisService,
    private readonly jwtService: JwtService,
  ) {}

  afterInit(server: Server) {
    this.wsService.bindServer(server);
  }

  async handleConnection(client: Socket) {
    // Extract token from multiple possible sources
    const token =
      client.handshake.auth?.token ||
      client.handshake.headers?.authorization?.replace("Bearer ", "");

    if (!token) {
      this.logger.warn("WS connection without token — disconnecting");
      client.disconnect();
      return;
    }

    try {
      const payload = this.jwtService.verify(token);
      const driverId = payload.driverId || payload.sub;

      if (!driverId) {
        this.logger.warn(
          "WS connection without driverId in payload — disconnecting",
        );
        client.disconnect();
        return;
      }

      client.data.driverId = driverId;
      client.join(`driver:${driverId}`);

      // Fire-and-forget metrics to prevent Redis stalls from blocking connections
      this.metrics.onConnect(driverId).catch(() => {});
      await this.driversService.updateStatus(driverId, DriverStatus.AVAILABLE);

      this.logger.log(`Driver ${driverId} connected`);
    } catch (error) {
      this.logger.warn(
        "WS connection with invalid token — disconnecting",
        error,
      );
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    const driverId = client.data.driverId;
    if (!driverId) return;

    // Fire-and-forget metrics to prevent Redis stalls from blocking disconnections
    this.metrics.onDisconnect(driverId).catch(() => {});

    // Delay OFFLINE status update to handle reconnection scenarios
    setTimeout(async () => {
      const stillConnected = Array.from(
        this.server.sockets.sockets.values(),
      ).some((s) => s.data?.driverId === driverId);

      if (!stillConnected) {
        await this.driversService.updateStatus(driverId, DriverStatus.OFFLINE);
        this.logger.log(`Driver ${driverId} marked OFFLINE`);
      }
    }, 30_000);
  }

  @SubscribeMessage("LOCATION_UPDATE_V1")
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

  @SubscribeMessage("PROOF_UPLOADED_V1")
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

  @SubscribeMessage("DRIVER_STATUS_V1")
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

  @SubscribeMessage("PING_V1")
  async handlePing(@ConnectedSocket() client: Socket) {
    const driverId = client.data.driverId;
    if (driverId) {
      // Fire-and-forget metrics to prevent Redis stalls from blocking message handling
      this.metrics.messageReceived(driverId).catch(() => {});
    }

    return {
      timestamp: Date.now(),
      status: "ok",
    };
  }

  @SubscribeMessage("DRIVER_HEARTBEAT_V1")
  async handleHeartbeat(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: any,
  ) {
    const driverId = client.data.driverId;
    if (driverId) {
      // Fire-and-forget metrics to prevent Redis stalls from blocking message handling
      this.metrics.messageReceived(driverId).catch(() => {});
    }

    // Process heartbeat and return ACK
    return handleDriverHeartbeat(
      client,
      data,
      this.redisService,
      this.driversService,
    );
  }

  @SubscribeMessage("SYNC_STATE_V1")
  async handleSyncState(@ConnectedSocket() client: Socket) {
    const driverId = client.data.driverId;
    if (driverId) {
      // Fire-and-forget metrics to prevent Redis stalls from blocking message handling
      this.metrics.messageReceived(driverId).catch(() => {});
    }

    // Get active delivery for driver
    const delivery = await this.deliveriesService.findActiveForDriver(driverId);

    // Get pending offers for driver
    const allOffers = await this.offersService.getDriverOffers(driverId);
    const pendingOffers = allOffers.filter(
      (offer) => offer.status === "PENDING",
    );

    return {
      delivery,
      offers: pendingOffers,
    };
  }
}
