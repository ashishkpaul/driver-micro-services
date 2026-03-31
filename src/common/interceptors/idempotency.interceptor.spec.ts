import { Test, TestingModule } from "@nestjs/testing";
import {
  ExecutionContext,
  CallHandler,
  HttpException,
  HttpStatus,
} from "@nestjs/common";
import { of, throwError } from "rxjs";
import { IdempotencyInterceptor } from "./idempotency.interceptor";
import { RedisService } from "../../redis/redis.service";

describe("IdempotencyInterceptor", () => {
  let interceptor: IdempotencyInterceptor;
  let redisService: RedisService;
  let mockClient: any;

  beforeEach(async () => {
    mockClient = {
      set: jest.fn().mockResolvedValue("OK"),
      get: jest.fn(),
      del: jest.fn().mockResolvedValue(1),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IdempotencyInterceptor,
        {
          provide: RedisService,
          useValue: {
            getClient: () => mockClient,
          },
        },
      ],
    }).compile();

    interceptor = module.get<IdempotencyInterceptor>(IdempotencyInterceptor);
    redisService = module.get<RedisService>(RedisService);
  });

  const createMockContext = (
    method: string = "POST",
    idempotencyKey?: string,
  ): ExecutionContext => {
    const request = {
      method,
      headers: idempotencyKey ? { "x-idempotency-key": idempotencyKey } : {},
    };
    const response = {
      status: jest.fn().mockReturnThis(),
      statusCode: 200,
      setHeader: jest.fn(),
      getHeader: jest.fn((name: string) => {
        if (name === "content-type") return "application/json";
        return undefined;
      }),
    };
    return {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => response,
      }),
    } as any;
  };

  const createMockHandler = (responseBody?: any, error?: any): CallHandler => ({
    handle: error ? () => throwError(() => error) : () => of(responseBody),
  });

  describe("non-POST requests", () => {
    it("should pass through GET requests", async () => {
      const context = createMockContext("GET");
      const handler = createMockHandler({ data: "test" });

      const result = await interceptor.intercept(context, handler);
      expect(mockClient.set).not.toHaveBeenCalled();
    });
  });

  describe("missing idempotency key", () => {
    it("should pass through requests without idempotency key", async () => {
      const context = createMockContext("POST");
      const handler = createMockHandler({ data: "test" });

      const result = await interceptor.intercept(context, handler);
      expect(mockClient.set).not.toHaveBeenCalled();
    });
  });

  describe("atomic first-claim", () => {
    it("should use NX flag for atomic lock acquisition", async () => {
      mockClient.set.mockResolvedValue("OK");
      const context = createMockContext("POST", "test-key-123");
      const handler = createMockHandler({ success: true });

      await interceptor.intercept(context, handler);

      expect(mockClient.set).toHaveBeenCalledWith(
        "idempotency:rest:test-key-123",
        expect.stringContaining('"state":"PROCESSING"'),
        "EX",
        expect.any(Number),
        "NX",
      );
    });

    it("should proceed when lock is acquired", async () => {
      mockClient.set.mockResolvedValue("OK");
      const context = createMockContext("POST", "test-key-123");
      const handler = createMockHandler({ success: true });

      const observable = await interceptor.intercept(context, handler);
      const result = await new Promise((resolve) =>
        observable.subscribe(resolve),
      );

      expect(result).toEqual({ success: true });
    });
  });

  describe("PROCESSING state", () => {
    it("should return 409 Conflict with Retry-After header", async () => {
      mockClient.set.mockResolvedValue(null); // Lock not acquired
      mockClient.get.mockResolvedValue(
        JSON.stringify({
          state: "PROCESSING",
          retryAfter: Date.now() + 5000,
        }),
      );

      const context = createMockContext("POST", "test-key-123");
      const handler = createMockHandler({ success: true });

      await expect(interceptor.intercept(context, handler)).rejects.toThrow(
        "currently being processed",
      );

      const response = context.switchToHttp().getResponse();
      expect(response.setHeader).toHaveBeenCalledWith(
        "Retry-After",
        expect.any(String),
      );
      expect(response.setHeader).toHaveBeenCalledWith(
        "X-Idempotency-State",
        "PROCESSING",
      );
    });
  });

  describe("COMPLETED state", () => {
    it("should return cached response on duplicate request", async () => {
      const cachedResponse = {
        statusCode: 200,
        body: { orderId: "123", status: "created" },
        headers: {
          "content-type": "application/json",
          "x-request-id": "req-456",
        },
      };

      mockClient.set.mockResolvedValue(null); // Lock not acquired
      mockClient.get.mockResolvedValue(
        JSON.stringify({
          state: "COMPLETED",
          response: cachedResponse,
        }),
      );

      const context = createMockContext("POST", "test-key-123");
      const handler = createMockHandler({ orderId: "456" }); // Different response

      const observable = await interceptor.intercept(context, handler);
      const result = await new Promise((resolve) =>
        observable.subscribe(resolve),
      );

      // Should return cached response, not handler response
      expect(result).toEqual({ orderId: "123", status: "created" });

      const response = context.switchToHttp().getResponse();
      expect(response.status).toHaveBeenCalledWith(200);
      expect(response.setHeader).toHaveBeenCalledWith(
        "X-Idempotent-Replay",
        "true",
      );
      expect(response.setHeader).toHaveBeenCalledWith(
        "x-request-id",
        "req-456",
      );
    });
  });

  describe("FAILED_RETRYABLE state", () => {
    it("should allow retry after retry window", async () => {
      mockClient.set
        .mockResolvedValueOnce(null) // Initial lock attempt fails
        .mockResolvedValueOnce("OK"); // Reclaim succeeds

      mockClient.get.mockResolvedValue(
        JSON.stringify({
          state: "FAILED_RETRYABLE",
          retryAfter: Date.now() - 1000, // Past retry time
        }),
      );

      const context = createMockContext("POST", "test-key-123");
      const handler = createMockHandler({ success: true });

      const observable = await interceptor.intercept(context, handler);
      const result = await new Promise((resolve) =>
        observable.subscribe(resolve),
      );

      expect(result).toEqual({ success: true });
    });
  });

  describe("success caching", () => {
    it("should cache successful response with headers", async () => {
      mockClient.set.mockResolvedValue("OK");
      const context = createMockContext("POST", "test-key-123");
      const handler = createMockHandler({ orderId: "123" });

      const observable = await interceptor.intercept(context, handler);
      await new Promise((resolve) => observable.subscribe(resolve));

      // Verify completed state was cached
      const completedCall = mockClient.set.mock.calls.find((call: any[]) =>
        call[1].includes('"state":"COMPLETED"'),
      );
      expect(completedCall).toBeDefined();

      const cachedPayload = JSON.parse(completedCall![1]);
      expect(cachedPayload.response.body).toEqual({ orderId: "123" });
      expect(cachedPayload.response.statusCode).toBe(200);
      expect(cachedPayload.response.headers["content-type"]).toBe(
        "application/json",
      );
    });
  });

  describe("error handling", () => {
    it("should mark as FAILED_RETRYABLE on 500 errors", async () => {
      mockClient.set.mockResolvedValue("OK");
      const context = createMockContext("POST", "test-key-123");
      const error = new HttpException(
        "Internal Server Error",
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
      const handler = createMockHandler(undefined, error);

      const observable = await interceptor.intercept(context, handler);

      await new Promise((resolve, reject) =>
        observable.subscribe({ error: resolve }),
      );

      // Verify FAILED_RETRYABLE was set
      const failedCall = mockClient.set.mock.calls.find((call: any[]) =>
        call[1].includes('"state":"FAILED_RETRYABLE"'),
      );
      expect(failedCall).toBeDefined();
    });

    it("should delete key on non-retryable errors", async () => {
      mockClient.set.mockResolvedValue("OK");
      const context = createMockContext("POST", "test-key-123");
      const error = new HttpException("Bad Request", HttpStatus.BAD_REQUEST);
      const handler = createMockHandler(undefined, error);

      const observable = await interceptor.intercept(context, handler);

      await new Promise((resolve, reject) =>
        observable.subscribe({ error: resolve }),
      );

      // Verify key was deleted for non-retryable error
      expect(mockClient.del).toHaveBeenCalledWith(
        "idempotency:rest:test-key-123",
      );
    });
  });
});
