// src/websocket/events/presence.handler.ts
// Driver heartbeat handler for presence protocol

import { Socket } from "socket.io";
import { RedisService } from "../../redis/redis.service";
import { DriversService } from "../../drivers/drivers.service";
import { DriverStatus } from "../../drivers/enums/driver-status.enum";

interface HeartbeatPayload {
  lat?: number;
  lon?: number;
  status: "AVAILABLE" | "OFFLINE" | "BUSY";
  clientTime: number;
  appVersion?: string;
}

export async function handleDriverHeartbeat(
  client: Socket,
  data: HeartbeatPayload,
  redisService: RedisService,
  driversService: DriversService,
) {
  const driverId = client.data.driverId;

  if (!driverId) {
    return {
      ok: false,
    };
  }

  try {
    const ttl = 45;

    if (data.status === "OFFLINE") {
      await redisService.markDriverOffline(driverId);
      await driversService.updateStatus(driverId, DriverStatus.OFFLINE);
      return {
        ok: true,
        serverTime: Date.now(),
        nextHeartbeatMs: 20000,
      };
    }

    if (data.lat && data.lon) {
      await redisService.updateDriverLocation(
        driverId,
        data.lat,
        data.lon,
        ttl,
      );
    }

    const driver = await driversService.findById(driverId);
    if (driver && driver.status !== DriverStatus.BUSY) {
      await driversService.updateStatus(driverId, DriverStatus.AVAILABLE);
    }

    return {
      ok: true,
      serverTime: Date.now(),
      nextHeartbeatMs: 20000,
    };
  } catch (e) {
    return {
      ok: false,
    };
  }
}
