// websocket/websocket.service.ts

import { Injectable, Logger } from '@nestjs/common';
import { Server } from 'socket.io';
import {
  DeliveryAssignedEvent,
  ProofAcceptedEvent,
  LocationAckEvent,
} from './interfaces/websocket.interface';

@Injectable()
export class WebSocketService {
  private readonly logger = new Logger(WebSocketService.name);
  private server!: Server;

  bindServer(server: Server) {
    this.server = server;
  }

  private room(driverId: string) {
    return `driver:${driverId}`;
  }

  emitDeliveryAssigned(driverId: string, event: DeliveryAssignedEvent) {
    this.server.to(this.room(driverId)).emit('DELIVERY_ASSIGNED_V1', event);
  }

  emitProofAccepted(driverId: string, event: ProofAcceptedEvent) {
    this.server.to(this.room(driverId)).emit('PROOF_ACCEPTED_V1', event);
  }

  emitLocationAck(driverId: string, event: LocationAckEvent) {
    this.server.to(this.room(driverId)).emit('LOCATION_ACK_V1', event);
  }

  emitError(driverId: string, code: string, message: string) {
    this.server.to(this.room(driverId)).emit('ERROR_V1', { code, message });
  }
}
