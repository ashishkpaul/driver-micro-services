// websocket/websocket.gateway.ts

import { WS_EVENTS } from "../../../packages/ws-contracts";
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
import { Cron } from "@nestjs/schedule";

import { WebSocketJwtGuard } from "./websocket.guard";
import { WebSocketService } from "./websocket.service";
import { DriverRealtimeService } from "../realtime/driver-realtime.service";
import { DriversService } from "../drivers/drivers.service";
import { DeliveriesService } from "../deliveries/deliveries.service";

import {
  LocationUpdateEvent,
  ProofUploadedEvent,
  DriverStatusEvent,
} from "./interfaces/websocket.interface";

import { handleProofUploaded } from "./events/proof.handler";
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
  private events: string[] = [];

  // Per-driver connection rate limiting
  private readonly connectionAttempts = new Map<string, number[]>();
  private readonly MAX_CONNECTIONS_PER_MINUTE = 30;

  // Duplicate-session tracking
  private readonly driverSessions = new Map<string, Set<string>>();

  constructor(
    private readonly wsService: WebSocketService,
    private readonly driverRealtime: DriverRealtimeService,
    private readonly driversService: DriversService,
    private readonly deliveriesService: DeliveriesService,
    private readonly metrics: WebSocketMetricsService,
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
  ) {
    // Register known subscription event names using WS_EVENTS constants
    this.register(WS_EVENTS.UPDATE_LOCATION);
    this.register(WS_EVENTS.PROOF_UPLOADED);
    this.register(WS_EVENTS.DRIVER_STATUS);
    this.register(WS_EVENTS.DRIVER_HEARTBEAT);
    this.register(WS_EVENTS.SYNC_STATE);
    // PING_V1 is not in WS_EVENTS - keep as raw string for now
    this.register("PING_V1");
  }

  /**
   * Register an event name
   */
  register(event: string): void {
    if (!this.events.includes(event)) {
      this.events.push(event);
    }
  }

  /**
   * Print registered events
   */
  printEvents(): void {
    console.log("");
    console.log("┌─ 🔌 WEBSOCKET EVENTS " + "─".repeat(28));
    this.events.forEach((event) => {
      console.log(`│  • ${event}`);
    });
    console.log("└" + "─".repeat(49));
  }

  afterInit(server: Server) {
    this.wsService.bindServer(server);
    this.printEvents();
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
      const payload = this.jwtService.verify(token, {
        ignoreExpiration: false,
      });
      const driverId = payload.driverId || payload.sub;

      if (!driverId) {
        this.logger.warn(
          "WS connection without driverId in payload — disconnecting",
        );
        client.disconnect();
        return;
      }

      // FIX: Per-driver connection rate limiting
      const now = Date.now();
      const attempts = this.connectionAttempts.get(driverId) || [];
      const recentAttempts = attempts.filter((t) => now - t < 60_000); // Last minute

      if (recentAttempts.length >= this.MAX_CONNECTIONS_PER_MINUTE) {
        this.logger.warn(
          `Rate limit exceeded for driver ${driverId}: ${recentAttempts.length} connections in last minute`,
        );
        client.disconnect();
        return;
      }

      // Record this connection attempt
      recentAttempts.push(now);
      this.connectionAttempts.set(driverId, recentAttempts);

      // FIX: Duplicate-session policy - disconnect existing sessions for this driver
      const existingSessions = this.driverSessions.get(driverId);
      if (existingSessions && existingSessions.size > 0) {
        this.logger.log(
          `Disconnecting ${existingSessions.size} existing session(s) for driver ${driverId}`,
        );
        for (const socketId of existingSessions) {
          const existingSocket = this.server.sockets.sockets.get(socketId);
          if (existingSocket && existingSocket.id !== client.id) {
            existingSocket.disconnect(true);
          }
        }
      }

      // Track this new session
      if (!this.driverSessions.has(driverId)) {
        this.driverSessions.set(driverId, new Set());
      }
      this.driverSessions.get(driverId)!.add(client.id);

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

    // FIX: Clean up session tracking
    const sessions = this.driverSessions.get(driverId);
    if (sessions) {
      sessions.delete(client.id);
      if (sessions.size === 0) {
        this.driverSessions.delete(driverId);
      }
    }

    // Fire-and-forget metrics to prevent Redis stalls from blocking disconnections
    this.metrics.onDisconnect(driverId).catch(() => {});

    // CRITICAL FIX: Use Redis TTL-based presence tracking instead of setTimeout
    // Mark driver with a 30-second TTL in Redis
    // If driver reconnects before TTL expires, presence is refreshed
    // If TTL expires, background job marks driver OFFLINE
    try {
      await this.redisService.getClient().set(
        `driver:presence:ttl:${driverId}`,
        "1",
        "EX",
        30, // 30 seconds TTL
      );
      this.logger.debug(`Driver ${driverId} disconnect — set 30s TTL in Redis`);
    } catch (error) {
      this.logger.error(
        `Failed to set presence TTL for driver ${driverId}:`,
        error instanceof Error ? error.message : String(error),
      );
      // Fallback: mark driver OFFLINE immediately
      await this.driversService.updateStatus(driverId, DriverStatus.OFFLINE);
    }
  }

  /**
   * Background job: Process expired driver presence entries
   * Runs every 10 seconds to check for drivers whose TTL has expired
   */
  @Cron("*/10 * * * * *")
  async processExpiredPresence(): Promise<void> {
    try {
      const client = this.redisService.getClient();

      // Use SCAN instead of KEYS to avoid blocking Redis
      const keys: string[] = [];
      let cursor = "0";
      do {
        const [nextCursor, batch] = await client.scan(cursor, "MATCH", "driver:presence:ttl:*", "COUNT", 100);
        cursor = nextCursor;
        keys.push(...batch);
      } while (cursor !== "0");

      if (keys.length === 0) return;

      const connectedDrivers = new Set<string>();
      for (const socket of (this.server?.sockets?.sockets?.values() ?? [])) {
        if (socket.data?.driverId) connectedDrivers.add(socket.data.driverId);
      }

      for (const key of keys) {
        const driverId = key.replace("driver:presence:ttl:", "");
        if (connectedDrivers.has(driverId)) {
          await client.del(key);
          continue;
        }
        const ttl = await client.ttl(key);
        if (ttl <= 0) {
          await this.driversService.updateStatus(driverId, DriverStatus.OFFLINE);
          await client.del(key);
          this.logger.log(`Driver ${driverId} marked OFFLINE (TTL expired)`);
        }
      }
    } catch (error) {
      this.logger.error("Error processing expired presence:", error instanceof Error ? error.message : String(error));
    }
  }

  @SubscribeMessage(WS_EVENTS.UPDATE_LOCATION)
  async handleLocation(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: LocationUpdateEvent,
  ) {
    const driverId = client.data.driverId;
    if (driverId) {
      // Fire-and-forget metrics to prevent Redis stalls from blocking message handling
      this.metrics.messageReceived(driverId).catch(() => {});
    }
    return this.driverRealtime.handleLocation(driverId, data);
  }

  @SubscribeMessage(WS_EVENTS.PROOF_UPLOADED)
  async handleProof(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: ProofUploadedEvent,
  ) {
    const driverId = client.data.driverId;
    if (driverId) {
      // Fire-and-forget metrics to prevent Redis stalls from blocking message handling
      this.metrics.messageReceived(driverId).catch(() => {});
    }
    // Note: Proof handling still uses the existing handler for now
    // This could be moved to DriverRealtimeService in the future
    return handleProofUploaded(client, data, this.deliveriesService);
  }

  @SubscribeMessage(WS_EVENTS.DRIVER_STATUS)
  async handleStatus(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: DriverStatusEvent,
  ) {
    const driverId = client.data.driverId;
    if (driverId) {
      // Fire-and-forget metrics to prevent Redis stalls from blocking message handling
      this.metrics.messageReceived(driverId).catch(() => {});
    }
    return this.driverRealtime.handleStatus(
      driverId,
      data.status as DriverStatus,
    );
  }

  /**
   * Send message to driver with ACK envelope for critical messages
   * ACK envelope includes: messageId, timestamp, requiresAck flag
   */
  sendWithAck(
    client: Socket,
    event: string,
    data: any,
    options: { requiresAck?: boolean; messageId?: string } = {},
  ): void {
    const envelope = {
      messageId:
        options.messageId ||
        `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date().toISOString(),
      requiresAck: options.requiresAck || false,
      data,
    };
    client.emit(event, envelope);
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

  @SubscribeMessage(WS_EVENTS.DRIVER_HEARTBEAT)
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
    return this.driverRealtime.handleHeartbeat(driverId, data);
  }

  @SubscribeMessage(WS_EVENTS.SYNC_STATE)
  async handleSyncState(@ConnectedSocket() client: Socket) {
    const driverId = client.data.driverId;
    if (driverId) {
      // Fire-and-forget metrics to prevent Redis stalls from blocking message handling
      this.metrics.messageReceived(driverId).catch(() => {});
    }

    // Use DriverRealtimeService for clean state retrieval
    return this.driverRealtime.getDriverState(driverId);
  }
}
