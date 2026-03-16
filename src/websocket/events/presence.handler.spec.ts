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

  it("should return error when no driverId", async () => {
    mockSocket.data.driverId = undefined;

    const result = await handleDriverHeartbeat(
      mockSocket,
      {
        status: "AVAILABLE",
        clientTime: Date.now(),
      },
      mockRedisService,
      mockDriversService,
    );

    expect(result).toEqual({ ok: false });
  });

  it("should mark driver offline when status is OFFLINE", async () => {
    const result = await handleDriverHeartbeat(
      mockSocket,
      {
        status: "OFFLINE",
        clientTime: Date.now(),
      },
      mockRedisService,
      mockDriversService,
    );

    expect(mockRedisService.markDriverOffline).toHaveBeenCalledWith(
      "test-driver-123",
    );
    expect(mockDriversService.updateStatus).toHaveBeenCalledWith(
      "test-driver-123",
      DriverStatus.OFFLINE,
    );
    expect(result).toEqual({
      ok: true,
      serverTime: expect.any(Number),
      nextHeartbeatMs: 20000,
    });
  });

  it("should update driver location when coordinates provided", async () => {
    mockDriversService.findById.mockResolvedValue({
      id: "test-driver-123",
      status: DriverStatus.AVAILABLE,
    });

    const result = await handleDriverHeartbeat(
      mockSocket,
      {
        status: "AVAILABLE",
        lat: 12.9716,
        lon: 77.5946,
        clientTime: Date.now(),
      },
      mockRedisService,
      mockDriversService,
    );

    expect(mockRedisService.updateDriverLocation).toHaveBeenCalledWith(
      "test-driver-123",
      12.9716,
      77.5946,
      45,
    );
    expect(mockDriversService.updateStatus).toHaveBeenCalledWith(
      "test-driver-123",
      DriverStatus.AVAILABLE,
    );
    expect(result).toEqual({
      ok: true,
      serverTime: expect.any(Number),
      nextHeartbeatMs: 20000,
    });
  });

  it("should not update status when driver is BUSY", async () => {
    mockDriversService.findById.mockResolvedValue({
      id: "test-driver-123",
      status: DriverStatus.BUSY,
    });

    const result = await handleDriverHeartbeat(
      mockSocket,
      {
        status: "AVAILABLE",
        lat: 12.9716,
        lon: 77.5946,
        clientTime: Date.now(),
      },
      mockRedisService,
      mockDriversService,
    );

    expect(mockDriversService.updateStatus).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: true,
      serverTime: expect.any(Number),
      nextHeartbeatMs: 20000,
    });
  });

  it("should handle driver not found gracefully", async () => {
    mockDriversService.findById.mockResolvedValue(null);

    const result = await handleDriverHeartbeat(
      mockSocket,
      {
        status: "AVAILABLE",
        lat: 12.9716,
        lon: 77.5946,
        clientTime: Date.now(),
      },
      mockRedisService,
      mockDriversService,
    );

    expect(mockDriversService.updateStatus).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: true,
      serverTime: expect.any(Number),
      nextHeartbeatMs: 20000,
    });
  });
});
