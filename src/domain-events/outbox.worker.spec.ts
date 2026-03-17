import { Test, TestingModule } from "@nestjs/testing";
import { OutboxWorker } from "./outbox.worker";
import { OutboxService } from "./outbox.service";
import { DataSource } from "typeorm";
import { OutboxStatus } from "./outbox-status.enum";

describe("OutboxWorker", () => {
  let worker: OutboxWorker;
  let dataSource: jest.Mocked<DataSource>;
  let outboxService: jest.Mocked<OutboxService>;

  const createMockDataSource = () => ({
    query: jest.fn(),
  });

  const createMockOutboxService = () => ({
    handle: jest.fn(),
  });

  beforeEach(async () => {
    dataSource = createMockDataSource() as any;
    outboxService = createMockOutboxService() as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OutboxWorker,
        { provide: DataSource, useValue: dataSource },
        { provide: OutboxService, useValue: outboxService },
      ],
    }).compile();

    worker = module.get<OutboxWorker>(OutboxWorker);
  });

  describe("toOutboxEvent", () => {
    it("should correctly map snake_case DB row to camelCase entity", () => {
      const rawRow = {
        id: 1,
        event_type: "DELIVERY_ASSIGNED",
        payload: { driverId: "driver-123" },
        status: "PENDING",
        retry_count: 0,
        last_error: null,
        next_retry_at: null,
        created_at: "2024-01-15T10:00:00Z",
        processed_at: null,
        locked_at: null,
        locked_by: null,
      };

      const event = (worker as any).toOutboxEvent(rawRow);

      expect(event.id).toBe(1);
      expect(event.eventType).toBe("DELIVERY_ASSIGNED");
      expect(event.payload.driverId).toBe("driver-123");
      expect(event.retryCount).toBe(0);
      expect(event.status).toBe(OutboxStatus.PENDING);
    });

    it("should handle null event_type gracefully", () => {
      const rawRow = {
        id: 2,
        event_type: null,
        payload: {},
        status: "PENDING",
        retry_count: 0,
        last_error: null,
        next_retry_at: null,
        created_at: "2024-01-15T10:00:00Z",
        processed_at: null,
        locked_at: null,
        locked_by: null,
      };

      const event = (worker as any).toOutboxEvent(rawRow);

      expect(event.id).toBe(2);
      expect(event.eventType).toBe(""); // Empty string, not undefined
    });
  });

  describe("claimBatch", () => {
    it("should query with explicit column selection", async () => {
      const mockRows = [
        {
          id: 1,
          event_type: "DELIVERY_ASSIGNED",
          payload: {},
          status: "PENDING",
          retry_count: 0,
          last_error: null,
          next_retry_at: null,
          created_at: "2024-01-15T10:00:00Z",
          processed_at: null,
          locked_at: null,
          locked_by: null,
        },
      ];

      dataSource.query.mockResolvedValue(mockRows);

      const result = await (worker as any).claimBatch(10);

      expect(result).toHaveLength(1);
      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining("FOR UPDATE SKIP LOCKED"),
        expect.any(Array),
      );

      const query = dataSource.query.mock.calls[0][0];
      expect(query).toContain("event_type");
      expect(query).toContain("retry_count");
    });
  });

  describe("process", () => {
    it("should quarantine events with null eventType", async () => {
      const mockRows = [
        {
          id: 1,
          event_type: null, // Corrupted row
          payload: {},
          status: "PENDING",
          retry_count: 0,
          last_error: null,
          next_retry_at: null,
          created_at: "2024-01-15T10:00:00Z",
          processed_at: null,
          locked_at: null,
          locked_by: null,
        },
      ];

      dataSource.query
        .mockResolvedValueOnce([]) // releaseStaleLocks
        .mockResolvedValueOnce(mockRows) // claimBatch
        .mockResolvedValueOnce([]); // forceFail

      await worker.process();

      // Should call forceFail, not outboxService.handle
      expect(outboxService.handle).not.toHaveBeenCalled();
      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE outbox SET status = 'FAILED'"),
        expect.arrayContaining([1, 10, "FORCE_FAIL: NULL_EVENT_TYPE"]),
      );
    });

    it("should process valid events normally", async () => {
      const mockRows = [
        {
          id: 1,
          event_type: "DELIVERY_ASSIGNED",
          payload: { driverId: "driver-123" },
          status: "PENDING",
          retry_count: 0,
          last_error: null,
          next_retry_at: null,
          created_at: "2024-01-15T10:00:00Z",
          processed_at: null,
          locked_at: null,
          locked_by: null,
        },
      ];

      dataSource.query
        .mockResolvedValueOnce([]) // releaseStaleLocks
        .mockResolvedValueOnce(mockRows) // claimBatch
        .mockResolvedValueOnce([]); // markCompleted

      outboxService.handle.mockResolvedValue(undefined);

      await worker.process();

      expect(outboxService.handle).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 1,
          eventType: "DELIVERY_ASSIGNED",
        }),
      );
    });
  });

  describe("handleFailure", () => {
    it("should force fail on structural errors without retry", async () => {
      const rawRow = {
        id: 1,
        event_type: "DELIVERY_ASSIGNED",
        payload: {},
        status: "PROCESSING",
        retry_count: 0,
        last_error: null,
        next_retry_at: null,
        created_at: "2024-01-15T10:00:00Z",
        processed_at: null,
        locked_at: "2024-01-15T10:00:00Z",
        locked_by: "worker-1",
      };

      const event = {
        id: 1,
        eventType: "DELIVERY_ASSIGNED",
        payload: {},
        status: OutboxStatus.PROCESSING,
        retryCount: 0,
        createdAt: new Date(),
      };

      const structuralError = new Error("Unknown outbox event type: undefined");

      dataSource.query.mockResolvedValue([]);

      await (worker as any).handleFailure(rawRow, event, structuralError);

      // Should update to FAILED with retry_count = MAX_RETRIES (10)
      expect(dataSource.query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE outbox SET status = 'FAILED'"),
        expect.arrayContaining([
          1,
          10,
          expect.stringContaining("Structural error"),
        ]),
      );
    });
  });
});
