// websocket/events/location.handler.ts

import { DriversService } from '../../drivers/drivers.service';
import { Socket } from 'socket.io';
import { LocationUpdateEvent } from '../interfaces/websocket.interface';

export async function handleLocationUpdate(
  client: Socket,
  data: LocationUpdateEvent,
  driversService: DriversService,
) {
  const driverId = client.data.driverId;

  await driversService.updateLocation(driverId, data.lat, data.lon);

  client.emit('LOCATION_ACK_V1', {
    driverId,
    deliveryId: data.deliveryId,
    ackAt: new Date().toISOString(),
  });
}
