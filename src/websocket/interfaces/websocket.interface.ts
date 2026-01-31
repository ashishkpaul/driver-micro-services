// websocket/interfaces/websocket.interface.ts

export interface WebSocketAuthPayload {
  driverId: string;
  sub: string;
  iat: number;
  exp: number;
}

export interface LocationUpdateEvent {
  lat: number;
  lon: number;
  accuracy?: number;
  deliveryId?: string;
  timestamp: string;
}

export interface ProofUploadedEvent {
  deliveryId: string;
  proofType: 'PICKUP' | 'DROPOFF';
  imageUrl: string;
  lat: number;
  lon: number;
  timestamp: string;
}

export interface DriverStatusEvent {
  status: 'AVAILABLE' | 'BUSY' | 'OFFLINE';
  timestamp: string;
}

export interface DeliveryAssignedEvent {
  deliveryId: string;
  sellerOrderId: string;
  pickupLocation: {
    lat: number;
    lon: number;
    address?: string;
  };
  dropLocation: {
    lat: number;
    lon: number;
    address?: string;
  };
  assignmentId: string;
  assignedAt: string;
}

export interface LocationAckEvent {
  driverId: string;
  deliveryId?: string;
  ackAt: string;
}

export interface ProofAcceptedEvent {
  deliveryId: string;
  proofId: string;
  proofType: 'PICKUP' | 'DROPOFF';
  acceptedAt: string;
}
