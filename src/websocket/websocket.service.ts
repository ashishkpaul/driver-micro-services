// websocket/websocket.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { Server } from 'socket.io';
import {
  DeliveryAssignedEvent,
  ProofAcceptedEvent,
  LocationAckEvent,
} from './interfaces/websocket.interface';
import { WebSocketMetricsService } from './websocket-metrics.service';

@Injectable()
export class WebSocketService {
  private readonly logger = new Logger(WebSocketService.name);
  private server!: Server;

  constructor(
    private readonly metrics: WebSocketMetricsService,
  ) {}

  bindServer(server: Server) {
    this.server = server;
  }

  private room(driverId: string) {
    return `driver:${driverId}`;
  }

  async emitDeliveryAssigned(driverId: string, event: DeliveryAssignedEvent) {
    this.server.to(this.room(driverId)).emit('DELIVERY_ASSIGNED_V1', event);
    // Fire-and-forget metrics to prevent Redis stalls from blocking message delivery
    this.metrics.messageSent(driverId).catch(() => {});
  }

  async emitProofAccepted(driverId: string, event: ProofAcceptedEvent) {
    this.server.to(this.room(driverId)).emit('PROOF_ACCEPTED_V1', event);
    // Fire-and-forget metrics to prevent Redis stalls from blocking message delivery
    this.metrics.messageSent(driverId).catch(() => {});
  }

  async emitLocationAck(driverId: string, event: LocationAckEvent) {
    this.server.to(this.room(driverId)).emit('LOCATION_ACK_V1', event);
    // Fire-and-forget metrics to prevent Redis stalls from blocking message delivery
    this.metrics.messageSent(driverId).catch(() => {});
  }

  async emitError(driverId: string, code: string, message: string) {
    this.server.to(this.room(driverId)).emit('ERROR_V1', { code, message });
    // Fire-and-forget metrics to prevent Redis stalls from blocking message delivery
    this.metrics.messageSent(driverId).catch(() => {});
  }
}
