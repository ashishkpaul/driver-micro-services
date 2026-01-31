// websocket/events/delivery.handler.ts
import { DriversService } from '../../drivers/drivers.service';
import { Socket } from 'socket.io';
import { DriverStatusEvent } from '../interfaces/websocket.interface';
import { DriverStatus } from '../../drivers/enums/driver-status.enum';

export async function handleDriverStatus(
  client: Socket,
  data: DriverStatusEvent,
  driversService: DriversService,
) {
  const driverId = client.data.driverId;

  await driversService.updateStatus(
    driverId,
    data.status as DriverStatus,
  );
}
