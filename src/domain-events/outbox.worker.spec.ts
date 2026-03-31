import { Test, TestingModule } from "@nestjs/testing";
import { DataSource } from "typeorm";
import { OutboxWorker } from "./outbox.worker";
import { OutboxService } from "./outbox.service";
import { MetricsService } from "./metrics.service";
import { CircuitBreakerService } from "./circuit-breaker.service";
import { WorkerLifecycleService } from "./worker-lifecycle.service";
import { OutboxJanitorService } from "./outbox-janitor.service";
import { AdaptiveBatchService } from "./adaptive-batch.service";

// Mock p-limit (ESM module that Jest can't parse)
jest.mock("p-limit", () => {
  return jest.fn(() => (fn: () => any) => fn());
});

describe("OutboxWorker", () => {
  let worker: OutboxWorker;
  let dataSource: DataSource;

  const mockQuery = jest.fn();
  const mockTransaction = jest.fn((callback) => callback({ query: mockQuery }));

  const mockDataSource = {
    query: mockQuery,
    transaction: mockTransaction,
  };

  const mockOutboxService = {
    handle: jest.fn(),
  };

  const mockMetricsService = {
    recordProcessingDuration: jest.fn(),
    incrementEventsProcessed: jest.fn(),
    incrementRetries: jest.fn(),
    getMetrics: jest.fn().mockReturnValue(10),
    updateMetrics: jest.fn(),
  };

  const mockCircuitBreakerService = {};

  const mockWorkerLifecycleService = {
    isShutdownRequested: jest.fn().mockReturnValue(false),
    addProcessingEvent: jest.fn(),
    removeProcessingEvent: jest.fn(),
    getProcessingStats: jest.fn().mockReturnValue({
      activeWorkers: 1,
      processingEvents: 0,
    }),
    shutdown: jest.fn(),
    forceShutdown: jest.fn(),
  };

  const mockJanitorService = {
    cleanup: jest.fn(),
  };

  const mockAdaptiveBatchService = {
    getOptimalBatchSize: jest.fn().mockResolvedValue(50),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutboxWorker,
        {
          provide: DataSource,
          useValue: mockDataSource,
        },
        {
          provide: OutboxService,
          useValue: mockOutboxService,
        },
        {
          provide: MetricsService,
          useValue: mockMetricsService,
        },
        {
          provide: CircuitBreakerService,
          useValue: mockCircuitBreakerService,
        },
        {
          provide: WorkerLifecycleService,
          useValue: mockWorkerLifecycleService,
        },
        {
          provide: OutboxJanitorService,
          useValue: mockJanitorService,
        },
        {
          provide: AdaptiveBatchService,
          useValue: mockAdaptiveBatchService,
        },
      ],
    }).compile();

    worker = module.get<OutboxWorker>(OutboxWorker);
    dataSource = module.get<DataSource>(DataSource);

    // Reset mocks
    jest.clearAllMocks();
  });

  describe("structural validation in claimBatch", () => {
    it("should throw on row missing id", async () => {
      const malformedRow = {
        // Missing id
        event_type: "ORDER_CREATED",
        payload: {},
        status: "PENDING",
        retry_count: 0,
        created_at: new Date().toISOString(),
      };

      mockQuery.mockResolvedValueOnce([malformedRow]); // SELECT query
      mockQuery.mockResolvedValueOnce([0, 1]); // UPDATE query

      await expect((worker as any).claimBatch(10)).rejects.toThrow(
        "STRUCTURAL_CORRUPTION: Row missing id",
      );
    });

    it("should throw on row missing event_type", async () => {
      const malformedRow = {
        id: 123,
        // Missing event_type
        payload: {},
        status: "PENDING",
        retry_count: 0,
        created_at: new Date().toISOString(),
      };

      mockQuery.mockResolvedValueOnce([malformedRow]); // SELECT query
      mockQuery.mockResolvedValueOnce([0, 1]); // UPDATE query

      await expect((worker as any).claimBatch(10)).rejects.toThrow(
        "STRUCTURAL_CORRUPTION: Row 123 missing event_type",
      );
    });

    it("should return valid rows with proper structure", async () => {
      const validRow = {
        id: 456,
        event_type: "ORDER_CREATED",
        payload: { orderId: "123" },
        status: "PENDING",
        retry_count: 0,
        last_error: null,
        next_retry_at: null,
        created_at: new Date().toISOString(),
        processed_at: null,
        locked_at: null,
        locked_by: null,
      };

      mockQuery.mockResolvedValueOnce([validRow]); // SELECT query
      mockQuery.mockResolvedValueOnce([0, 1]); // UPDATE query

      const result = await (worker as any).claimBatch(10);

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(456);
      expect(result[0].event_type).toBe("ORDER_CREATED");
    });
  });

  describe("structural validation in toOutboxEvent", () => {
    it("should throw on null/undefined row (fail-fast)", () => {
      // STRICT FAIL-FAST: null row indicates bug in claimBatch or data corruption
      expect(() => (worker as any).toOutboxEvent(null)).toThrow(
        "STRUCTURAL_CORRUPTION: toOutboxEvent received null/undefined row",
      );
    });

    it("should throw on undefined row (fail-fast)", () => {
      expect(() => (worker as any).toOutboxEvent(undefined)).toThrow(
        "STRUCTURAL_CORRUPTION: toOutboxEvent received null/undefined row",
      );
    });

    it("should throw on row missing id after claimBatch validation", () => {
      const rowWithMissingId = {
        event_type: "ORDER_CREATED",
        payload: {},
        status: "PENDING",
        retry_count: 0,
        created_at: new Date().toISOString(),
      };

      expect(() => (worker as any).toOutboxEvent(rowWithMissingId)).toThrow(
        "STRUCTURAL_CORRUPTION: Row missing id in toOutboxEvent",
      );
    });

    it("should throw on row with null event_type (fail-fast)", () => {
      const rowWithNullEventType = {
        id: 789,
        event_type: null,
        payload: {},
        status: "PENDING",
        retry_count: 0,
        created_at: new Date().toISOString(),
      };

      // STRICT FAIL-FAST: null event_type indicates bug in claimBatch
      expect(() => (worker as any).toOutboxEvent(rowWithNullEventType)).toThrow(
        "STRUCTURAL_CORRUPTION: Row 789 missing event_type in toOutboxEvent",
      );
    });

    it("should throw on row with undefined event_type (fail-fast)", () => {
      const rowWithUndefinedEventType = {
        id: 790,
        event_type: undefined,
        payload: {},
        status: "PENDING",
        retry_count: 0,
        created_at: new Date().toISOString(),
      };

      expect(() =>
        (worker as any).toOutboxEvent(rowWithUndefinedEventType),
      ).toThrow(
        "STRUCTURAL_CORRUPTION: Row 790 missing event_type in toOutboxEvent",
      );
    });

    it("should convert valid row to OutboxEvent", () => {
      const validRow = {
        id: 123,
        event_type: "ORDER_CREATED",
        payload: { orderId: "456" },
        status: "PENDING",
        retry_count: 2,
        last_error: "Previous error",
        next_retry_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        processed_at: null,
        locked_at: null,
        locked_by: null,
        idempotency_key: "key-123",
        version: 1,
      };

      const result = (worker as any).toOutboxEvent(validRow);

      expect(result.id).toBe(123);
      expect(result.eventType).toBe("ORDER_CREATED");
      expect(result.payload).toEqual({ orderId: "456" });
      expect(result.retryCount).toBe(2);
      expect(result.lastError).toBe("Previous error");
      expect(result.idempotencyKey).toBe("key-123");
    });
  });
});
