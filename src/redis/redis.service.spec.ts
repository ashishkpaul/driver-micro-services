import { Test, TestingModule } from "@nestjs/testing";
import { RedisService } from "./redis.service";

describe("RedisService – GEO availability invariants", () => {
  let service: RedisService;
  let redisMock: any;

  beforeEach(async () => {
    // Create a mock Redis instance
    redisMock = {
      pipeline: jest.fn(() => ({
        geoadd: jest.fn().mockReturnThis(),
        hset: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        zrem: jest.fn().mockReturnThis(),
        del: jest.fn().mockReturnThis(),
        hget: jest.fn().mockReturnThis(),
        exists: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      })),
      call: jest.fn(),
      ping: jest.fn(),
      quit: jest.fn(),
      on: jest.fn(),
      connect: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [RedisService],
    }).compile();

    service = module.get<RedisService>(RedisService);

    // Manually inject the mock Redis instance (bypassing onModuleInit)
    (service as any).redis = redisMock;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe("markDriverBusy", () => {
    it("removes driver from GEOSET and updates status to BUSY", async () => {
      await service.markDriverBusy("driver-123");

      const pipeline = redisMock.pipeline.mock.results[0].value;

      expect(pipeline.zrem).toHaveBeenCalledWith(
        "drivers:geo",
        "driver:driver-123",
      );
      expect(pipeline.hset).toHaveBeenCalledWith(
        "drivers:status",
        "driver-123",
        "BUSY",
      );
      expect(pipeline.del).toHaveBeenCalledWith("driver:online:driver-123");
      expect(pipeline.exec).toHaveBeenCalled();
    });
  });

  describe("markDriverOffline", () => {
    it("removes driver from GEOSET and updates status to OFFLINE", async () => {
      await service.markDriverOffline("driver-456");

      const pipeline = redisMock.pipeline.mock.results[0].value;

      expect(pipeline.zrem).toHaveBeenCalledWith(
        "drivers:geo",
        "driver:driver-456",
      );
      expect(pipeline.hset).toHaveBeenCalledWith(
        "drivers:status",
        "driver-456",
        "OFFLINE",
      );
      expect(pipeline.del).toHaveBeenCalledWith("driver:online:driver-456");
      expect(pipeline.exec).toHaveBeenCalled();
    });
  });

  describe("findAvailableDrivers", () => {
    it("should use pipeline for batch status and online checks", async () => {
      // Mock GEOSEARCH to return two drivers
      redisMock.call.mockResolvedValue([
        ["driver:driver1", "1.5"],
        ["driver:driver2", "2.3"],
      ]);

      // Mock pipeline exec to return responses
      const mockPipeline = {
        hget: jest.fn().mockReturnThis(),
        exists: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([
          [null, "AVAILABLE"], // hget for driver1
          [null, 1],           // exists for driver1
          [null, "AVAILABLE"], // hget for driver2
          [null, 0],           // exists for driver2 (offline)
        ]),
      };
      redisMock.pipeline.mockReturnValue(mockPipeline);

      const result = await service.findAvailableDrivers(12.34, 56.78, 5, 10);

      // Verify GEOSEARCH was called with correct parameters
      expect(redisMock.call).toHaveBeenCalledWith(
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
        10,
      );

      // Verify pipeline was created
      expect(redisMock.pipeline).toHaveBeenCalled();

      // Verify pipeline commands were added
      expect(mockPipeline.hget).toHaveBeenCalledTimes(2);
      expect(mockPipeline.exists).toHaveBeenCalledTimes(2);

      // Only driver1 should be available (online=1)
      expect(result).toEqual([
        { driverId: "driver1", distanceKm: 1.5 },
      ]);
    });

    it("should return empty array when no drivers found", async () => {
      redisMock.call.mockResolvedValue([]);

      const result = await service.findAvailableDrivers(12.34, 56.78, 5, 10);

      expect(result).toEqual([]);
      expect(redisMock.pipeline).not.toHaveBeenCalled();
    });

    it("should cap radius to 100km", async () => {
      redisMock.call.mockResolvedValue([]);

      await service.findAvailableDrivers(12.34, 56.78, 150, 10);

      expect(redisMock.call).toHaveBeenCalledWith(
        "GEOSEARCH",
        "drivers:geo",
        "FROMLONLAT",
        56.78,
        12.34,
        "BYRADIUS",
        100, // capped to 100
        "km",
        "WITHDIST",
        "COUNT",
        10,
      );
    });
  });

  describe("ping", () => {
    it("should return true when Redis responds with PONG", async () => {
      redisMock.ping.mockResolvedValue("PONG");

      const result = await service.ping();

      expect(result).toBe(true);
      expect(redisMock.ping).toHaveBeenCalled();
    });

    it("should return false when Redis throws error", async () => {
      redisMock.ping.mockRejectedValue(new Error("Connection failed"));

      const result = await service.ping();

      expect(result).toBe(false);
    });
  });

  describe("updateDriverLocation", () => {
    it("should add driver to GEO set, set status AVAILABLE, and set online TTL", async () => {
      await service.updateDriverLocation("driver-789", 12.34, 56.78, 60);

      const pipeline = redisMock.pipeline.mock.results[0].value;

      expect(pipeline.geoadd).toHaveBeenCalledWith(
        "drivers:geo",
        56.78,
        12.34,
        "driver:driver-789",
      );
      expect(pipeline.hset).toHaveBeenCalledWith(
        "drivers:status",
        "driver-789",
        "AVAILABLE",
      );
      expect(pipeline.set).toHaveBeenCalledWith(
        "driver:online:driver-789",
        "1",
        "EX",
        60,
      );
      expect(pipeline.exec).toHaveBeenCalled();
    });
  });
});