import { Test, TestingModule } from "@nestjs/testing";
import { RedisService } from "./redis.service";
import Redis from "ioredis";
import { Logger } from "@nestjs/common";

// Mock ioredis
jest.mock("ioredis", () => {
  const mRedis = {
    connect: jest.fn(),
    quit: jest.fn(),
    on: jest.fn(),
    pipeline: jest.fn(() => ({
      geoadd: jest.fn().mockReturnThis(),
      hset: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      zrem: jest.fn().mockReturnThis(),
      del: jest.fn().mockReturnThis(),
      hget: jest.fn().mockReturnThis(),
      exists: jest.fn().mockReturnThis(),
      exec: jest.fn(),
    })),
    call: jest.fn(),
    hget: jest.fn(),
    exists: jest.fn(),
    ping: jest.fn(),
  };
  return jest.fn(() => mRedis);
});

describe("RedisService", () => {
  let service: RedisService;
  let mockRedis: jest.Mocked<Redis>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RedisService],
    }).compile();

    service = module.get<RedisService>(RedisService);
    // Get the instance created by the mock constructor
    mockRedis = (Redis as jest.MockedClass<typeof Redis>).mock.instances[0] as any;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("findAvailableDrivers", () => {
    it("should use pipeline for batch operations", async () => {
      // Mock GEOSEARCH to return some drivers
      const mockGeoResults: [string, string][] = [
        ["driver:driver1", "1.5"],
        ["driver:driver2", "2.3"],
      ];
      mockRedis.call.mockResolvedValue(mockGeoResults);

      // Mock pipeline exec to return status and online checks
      const mockPipeline = {
        geoadd: jest.fn().mockReturnThis(),
        hset: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        zrem: jest.fn().mockReturnThis(),
        del: jest.fn().mockReturnThis(),
        hget: jest.fn().mockReturnThis(),
        exists: jest.fn().mockReturnThis(),
        exec: jest.fn(),
      };
      mockRedis.pipeline.mockReturnValue(mockPipeline as any);
      
      // Mock pipeline exec to return responses
      mockPipeline.exec.mockResolvedValue([
        [null, "AVAILABLE"], // hget for driver1
        [null, 1],           // exists for driver1
        [null, "AVAILABLE"], // hget for driver2
        [null, 0],           // exists for driver2 (offline)
      ]);

      const result = await service.findAvailableDrivers(12.34, 56.78, 5, 10);

      // Verify GEOSEARCH was called with correct parameters
      expect(mockRedis.call).toHaveBeenCalledWith(
        "GEOSEARCH",
        "drivers:geo",
        "FROMLONLAT",
        56.78,
        12.34,
        "BYRADIUS",
        5,
        "km",
        "WITHDIST",
        "COUNT",
        10
      );

      // Verify pipeline was created
      expect(mockRedis.pipeline).toHaveBeenCalled();

      // Verify pipeline commands were added
      expect(mockPipeline.hget).toHaveBeenCalledTimes(2);
      expect(mockPipeline.exists).toHaveBeenCalledTimes(2);

      // Only driver1 should be available (online=1)
      expect(result).toEqual([
        { driverId: "driver1", distanceKm: 1.5 },
      ]);
    });

    it("should return empty array when no drivers found", async () => {
      mockRedis.call.mockResolvedValue([]);
      
      const result = await service.findAvailableDrivers(12.34, 56.78, 5, 10);
      
      expect(result).toEqual([]);
      expect(mockRedis.pipeline).not.toHaveBeenCalled();
    });

    it("should cap radius to 100km", async () => {
      mockRedis.call.mockResolvedValue([]);
      
      await service.findAvailableDrivers(12.34, 56.78, 150, 10);
      
      expect(mockRedis.call).toHaveBeenCalledWith(
        "GEOSEARCH",
        "drivers:geo",
        "FROMLONLAT",
        56.78,
        12.34,
        "BYRADIUS",
        100,
        "km",
        "WITHDIST",
        "COUNT",
        10
      );
    });
  });

  describe("ping", () => {
    it("should return true when Redis responds with PONG", async () => {
      mockRedis.ping.mockResolvedValue("PONG");
      
      const result = await service.ping();
      
      expect(result).toBe(true);
      expect(mockRedis.ping).toHaveBeenCalled();
    });

    it("should return false when Redis throws error", async () => {
      mockRedis.ping.mockRejectedValue(new Error("Connection failed"));
      
      const result = await service.ping();
      
      expect(result).toBe(false);
    });
  });
});