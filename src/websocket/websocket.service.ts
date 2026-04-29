// src/websocket/websocket.service.ts

import { Injectable, Logger } from "@nestjs/common";
import { Server } from "socket.io";
import {
  DeliveryAssignedEvent,
  ProofAcceptedEvent,
  LocationAckEvent,
} from "./interfaces/websocket.interface";
import { WebSocketMetricsService } from "./websocket-metrics.service";
import { WS_EVENTS, WsEvent } from "../../../packages/ws-contracts";

@Injectable()
export class WebSocketService {
  private readonly logger = new Logger(WebSocketService.name);
  private server!: Server;

  constructor(private readonly metrics: WebSocketMetricsService) {}

  bindServer(server: Server) {
    this.server = server;
  }

  private room(driverId: string) {
    return `driver:${driverId}`;
  }

  async emitDeliveryAssigned(driverId: string, event: DeliveryAssignedEvent) {
    this.server
      .to(this.room(driverId))
      .emit(WS_EVENTS.DELIVERY_ASSIGNED, event);
    this.metrics.messageSent(driverId).catch(() => {});
  }

  async emitProofAccepted(driverId: string, event: ProofAcceptedEvent) {
    this.server.to(this.room(driverId)).emit(WS_EVENTS.PROOF_ACCEPTED, event);
    this.metrics.messageSent(driverId).catch(() => {});
  }

  async emitLocationAck(driverId: string, event: LocationAckEvent) {
    this.server.to(this.room(driverId)).emit(WS_EVENTS.LOCATION_ACK, event);
    this.metrics.messageSent(driverId).catch(() => {});
  }

  async emitError(driverId: string, code: string, message: string) {
    this.server
      .to(this.room(driverId))
      .emit(WS_EVENTS.ERROR, { code, message });
    this.metrics.messageSent(driverId).catch(() => {});
  }

  /**
   * Generic method to emit any event to a specific driver
   */
  async emitToDriver(driverId: string, event: WsEvent, data: any) {
    const eventName = WS_EVENTS[event];
    const room = this.room(driverId);
    const sockets = this.server?.sockets?.adapter?.rooms?.get(room);
    const socketCount = sockets?.size ?? 0;
    this.logger.log(
      `[emitToDriver] driverId=${driverId} | event=${event} → ${eventName} | room=${room} | connectedSockets=${socketCount} | data=${JSON.stringify(data)}`,
    );
    this.server.to(room).emit(eventName, data);
    this.metrics.messageSent(driverId).catch(() => {});
  }

  /**
   * Check if driver is connected
   */
  isDriverConnected(driverId: string): boolean {
    const sockets = this.server.sockets.adapter.rooms.get(this.room(driverId));
    return !!sockets && sockets.size > 0;
  }
}
