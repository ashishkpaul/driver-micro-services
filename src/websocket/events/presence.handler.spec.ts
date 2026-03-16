// src/websocket/events/presence.handler.spec.ts
// Tests for driver heartbeat handler

import { handleDriverHeartbeat } from "./presence.handler";
import { RedisService } from "../../redis/redis.service";
import { DriversService } from "../../drivers/drivers.service";
import { DriverStatus } from "../../drivers/enums/driver-status.enum";

// Mock Socket.IO
const createMockSocket = (driverId: string) => ({
  data: { driverId },
  emit: jest.fn(),
});

// Mock RedisService
const createMockRedisService = () => ({
  markDriverOffline: jest.fn(),
  updateDriverLocation: jest.fn(),
  updateDriverPresence: jest.fn(),
});

// Mock DriversService
const createMockDriversService = () => ({
  findById: jest.fn(),
  updateStatus: jest.fn(),
});

describe("handleDriverHeartbeat", () => {
  let mockSocket: any;
  let mockRedisService: any;
  let mockDriversService: any;

  beforeEach(() => {
    mockSocket = createMockSocket("test-driver-123");
    mockRedisService = createMockRedisService();
    mockDriversService = createMockDriversService();
  });

  it("should reject heartbeat with mismatched driver ID", async () => {
    mockSocket.data.driverId = "wrong-driver";

    await handleDriverHeartbeat(
      mockSocket,
      {
        driverId: "test-driver-123",
        status: "AVAILABLE",
        timestamp: new Date().toISOString(),
      },
      mockRedisService,
      mockDriversService,
    );

    expect(mockSocket.emit).toHaveBeenCalledWith("ERROR_V1", {
      code: "HEARTBEAT_MISMATCH",
      message: "Driver ID mismatch",
    });
  });

  it("should mark driver offline when status is OFFLINE", async () => {
    await handleDriverHeartbeat(
      mockSocket,
      {
        driverId: "test-driver-123",
        status: "OFFLINE",
        timestamp: new Date().toISOString(),
      },
      mockRedisService,
      mockDriversService,
    );

    expect(mockRedisService.markDriverOffline).toHaveBeenCalledWith(
      "test-driver-123",
    );
    expect(mockSocket.emit).toHaveBeenCalledWith(
      "HEARTBEAT_ACK_V1",
      expect.objectContaining({
        receivedAt: expect.any(String),
        serverTime: expect.any(Number),
        ttlSeconds: 45,
      }),
    );
  });

  it("should update driver location and status when coordinates provided", async () => {
    mockDriversService.findById.mockResolvedValue({
      id: "test-driver-123",
      status: DriverStatus.BUSY,
    });

    await handleDriverHeartbeat(
      mockSocket,
      {
        driverId: "test-driver-123",
        status: "AVAILABLE",
        lat: 12.9716,
        lon: 77.5946,
        timestamp: new Date().toISOString(),
      },
      mockRedisService,
      mockDriversService,
    );

    expect(mockRedisService.updateDriverPresence).toHaveBeenCalledWith(
      "test-driver-123",
      12.9716,
      77.5946,
      "AVAILABLE",
      45,
    );
    expect(mockDriversService.updateStatus).toHaveBeenCalledWith(
      "test-driver-123",
      DriverStatus.AVAILABLE,
    );
  });

  it("should handle driver not found gracefully", async () => {
    mockDriversService.findById.mockResolvedValue(null);

    await handleDriverHeartbeat(
      mockSocket,
      {
        driverId: "test-driver-123",
        status: "AVAILABLE",
        lat: 12.9716,
        lon: 77.5946,
        timestamp: new Date().toISOString(),
      },
      mockRedisService,
      mockDriversService,
    );

    expect(mockDriversService.updateStatus).not.toHaveBeenCalled();
  });

  it("should handle client_unload reason", async () => {
    await handleDriverHeartbeat(
      mockSocket,
      {
        driverId: "test-driver-123",
        status: "AVAILABLE",
        reason: "client_unload",
        timestamp: new Date().toISOString(),
      },
      mockRedisService,
      mockDriversService,
    );

    expect(mockRedisService.markDriverOffline).toHaveBeenCalledWith(
      "test-driver-123",
    );
  });
});
