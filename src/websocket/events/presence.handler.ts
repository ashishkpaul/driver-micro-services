// src/websocket/events/presence.handler.ts
// Driver heartbeat handler for presence protocol

import { Socket } from "socket.io";
import { RedisService } from "../../redis/redis.service";
import { DriversService } from "../../drivers/drivers.service";
import { DriverStatus } from "../../drivers/enums/driver-status.enum";

interface HeartbeatPayload {
  driverId: string;
  status: "AVAILABLE" | "BUSY" | "OFFLINE";
  lat?: number;
  lon?: number;
  timestamp: string;
  clientVersion?: string;
  tabActive?: boolean;
  reason?: string;
}

export async function handleDriverHeartbeat(
  client: Socket,
  data: HeartbeatPayload,
  redisService: RedisService,
  driversService: DriversService,
) {
  const driverId = client.data.driverId;

  // Security: verify driver matches socket
  if (driverId !== data.driverId) {
    client.emit("ERROR_V1", {
      code: "HEARTBEAT_MISMATCH",
      message: "Driver ID mismatch",
    });
    return;
  }

  try {
    // Update Redis with explicit TTL (longer than heartbeat interval)
    const ttlSeconds = 45; // 45 seconds gives grace for 20s interval

    if (data.status === "OFFLINE" || data.reason === "client_unload") {
      // Immediate offline
      await redisService.markDriverOffline(driverId);
    } else if (data.lat && data.lon) {
      // Update location and status using presence method
      await redisService.updateDriverPresence(
        driverId,
        data.lat,
        data.lon,
        data.status,
        ttlSeconds,
      );

      // Update driver record if status changed
      const driver = await driversService.findById(driverId);
      if (driver && driver.status !== data.status) {
        await driversService.updateStatus(
          driverId,
          data.status as DriverStatus,
        );
      }
    }

    // Acknowledge receipt
    client.emit("HEARTBEAT_ACK_V1", {
      receivedAt: new Date().toISOString(),
      serverTime: Date.now(),
      ttlSeconds,
    });
  } catch (error) {
    console.error("Heartbeat processing failed:", error);
    client.emit("ERROR_V1", {
      code: "HEARTBEAT_FAILED",
      message: "Failed to process heartbeat",
    });
  }
}
