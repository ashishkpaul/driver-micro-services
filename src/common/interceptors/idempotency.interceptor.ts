import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  ConflictException,
  HttpException,
} from "@nestjs/common";
import { RedisService } from "../../redis/redis.service";
import { Observable, of, throwError } from "rxjs";
import { tap, catchError } from "rxjs/operators";

// Idempotency states
enum IdempotencyState {
  PROCESSING = "PROCESSING",
  COMPLETED = "COMPLETED",
  FAILED_RETRYABLE = "FAILED_RETRYABLE",
}

interface CachedResponse {
  statusCode: number;
  body: any;
  headers?: Record<string, string>;
}

interface IdempotencyRecord {
  state: IdempotencyState;
  response?: CachedResponse;
  retryAfter?: number; // Unix timestamp for when to retry
}

// Headers to preserve on replay (in addition to content-type)
const REPLAYABLE_HEADERS = [
  "content-type",
  "content-length",
  "etag",
  "location",
  "x-request-id",
];

const DEFAULT_TTL_SECONDS = 86400; // 24 hours
const PROCESSING_TIMEOUT_SECONDS = 300; // 5 minutes max processing time

@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(private readonly redis: RedisService) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();

    // Only apply to POST requests
    if (request.method !== "POST") {
      return next.handle();
    }

    const idempotencyKey = request.headers["x-idempotency-key"];

    // If no key is provided, we allow the request to proceed (optional enforcement)
    if (!idempotencyKey) {
      return next.handle();
    }

    const redisKey = `idempotency:rest:${idempotencyKey}`;
    const client = this.redis.getClient();

    // CRITICAL: Atomic first-claim with NX to prevent race conditions
    // First, try to atomically set PROCESSING if key doesn't exist
    const processingPayload: IdempotencyRecord = {
      state: IdempotencyState.PROCESSING,
    };
    const lockResult = await client.set(
      redisKey,
      JSON.stringify(processingPayload),
      "EX",
      PROCESSING_TIMEOUT_SECONDS,
      "NX",
    );

    if (lockResult === "OK") {
      // We won the lock - proceed with request
      return next.handle().pipe(
        tap((responseBody) => {
          // On success, cache the response atomically
          const response = context.switchToHttp().getResponse();
          const cachedHeaders: Record<string, string> = {};

          // Capture replayable headers
          for (const header of REPLAYABLE_HEADERS) {
            const value = response.getHeader(header);
            if (value !== undefined) {
              cachedHeaders[header] = String(value);
            }
          }

          const cachedResponse: CachedResponse = {
            statusCode: response.statusCode || 200,
            body: responseBody,
            headers: cachedHeaders,
          };

          const completedPayload: IdempotencyRecord = {
            state: IdempotencyState.COMPLETED,
            response: cachedResponse,
          };

          // Fire-and-forget with error logging (non-blocking)
          client
            .set(
              redisKey,
              JSON.stringify(completedPayload),
              "EX",
              DEFAULT_TTL_SECONDS,
            )
            .catch((err: Error) => {
              console.error("Failed to cache idempotency response:", err);
            });
        }),
        catchError((error) => {
          // Determine if error is retryable
          const isRetryable = this.isRetryableError(error);

          if (isRetryable) {
            const retryAfterTimestamp = Date.now() + 30_000; // 30 seconds
            const failedPayload: IdempotencyRecord = {
              state: IdempotencyState.FAILED_RETRYABLE,
              retryAfter: retryAfterTimestamp,
            };

            client
              .set(
                redisKey,
                JSON.stringify(failedPayload),
                "EX",
                DEFAULT_TTL_SECONDS,
              )
              .catch((err: Error) => {
                console.error("Failed to set idempotency failed state:", err);
              });
          } else {
            // Non-retryable error - delete the key to allow fresh request
            client.del(redisKey).catch((err: Error) => {
              console.error("Failed to delete idempotency key:", err);
            });
          }

          // Re-throw the original error
          return throwError(() => error);
        }),
      );
    }

    // Lock not acquired - key already exists, check its state
    const existingValue = await client.get(redisKey);

    if (!existingValue) {
      // Race condition: key expired between SET NX and GET
      // Retry the atomic lock acquisition
      const retryLockResult = await client.set(
        redisKey,
        JSON.stringify(processingPayload),
        "EX",
        PROCESSING_TIMEOUT_SECONDS,
        "NX",
      );

      if (retryLockResult === "OK") {
        // Won on retry - proceed with request
        return next.handle().pipe(
          tap((responseBody) => {
            const response = context.switchToHttp().getResponse();
            const cachedHeaders: Record<string, string> = {};

            for (const header of REPLAYABLE_HEADERS) {
              const value = response.getHeader(header);
              if (value !== undefined) {
                cachedHeaders[header] = String(value);
              }
            }

            const cachedResponse: CachedResponse = {
              statusCode: response.statusCode || 200,
              body: responseBody,
              headers: cachedHeaders,
            };

            const completedPayload: IdempotencyRecord = {
              state: IdempotencyState.COMPLETED,
              response: cachedResponse,
            };

            client
              .set(
                redisKey,
                JSON.stringify(completedPayload),
                "EX",
                DEFAULT_TTL_SECONDS,
              )
              .catch((err: Error) => {
                console.error("Failed to cache idempotency response:", err);
              });
          }),
          catchError((error) => {
            const isRetryable = this.isRetryableError(error);

            if (isRetryable) {
              const retryAfterTimestamp = Date.now() + 30_000;
              const failedPayload: IdempotencyRecord = {
                state: IdempotencyState.FAILED_RETRYABLE,
                retryAfter: retryAfterTimestamp,
              };

              client
                .set(
                  redisKey,
                  JSON.stringify(failedPayload),
                  "EX",
                  DEFAULT_TTL_SECONDS,
                )
                .catch((err: Error) => {
                  console.error("Failed to set idempotency failed state:", err);
                });
            } else {
              client.del(redisKey).catch((err: Error) => {
                console.error("Failed to delete idempotency key:", err);
              });
            }

            return throwError(() => error);
          }),
        );
      }

      // Still can't acquire - fall through to state check
    }

    // Parse the existing state
    let parsed: IdempotencyRecord;
    try {
      parsed = JSON.parse(existingValue!);
    } catch {
      // Corrupted data - delete and allow retry
      await client.del(redisKey);
      throw new ConflictException(
        `Request with idempotency key '${idempotencyKey}' has corrupted state. Please retry.`,
      );
    }

    switch (parsed.state) {
      case IdempotencyState.COMPLETED:
        // Return the cached successful response
        if (parsed.response) {
          const response = context.switchToHttp().getResponse();
          response.status(parsed.response.statusCode);

          // Replay all cached headers
          if (parsed.response.headers) {
            for (const [key, value] of Object.entries(
              parsed.response.headers,
            )) {
              response.setHeader(key, value);
            }
          }

          // Add idempotency replay header for observability
          response.setHeader("X-Idempotent-Replay", "true");

          return of(parsed.response.body);
        }
        // No cached response - delete and allow retry
        await client.del(redisKey);
        throw new ConflictException(
          `Request with idempotency key '${idempotencyKey}' completed but has no cached response. Please retry.`,
        );

      case IdempotencyState.PROCESSING: {
        // Still processing - return 409 with Retry-After
        const response = context.switchToHttp().getResponse();
        const retryAfterSeconds = parsed.retryAfter
          ? Math.ceil((parsed.retryAfter - Date.now()) / 1000)
          : 5; // Default 5 seconds

        response.setHeader(
          "Retry-After",
          Math.max(1, retryAfterSeconds).toString(),
        );
        response.setHeader("X-Idempotency-State", "PROCESSING");

        throw new ConflictException(
          `Request with idempotency key '${idempotencyKey}' is currently being processed. Retry after ${retryAfterSeconds} seconds.`,
        );
      }

      case IdempotencyState.FAILED_RETRYABLE: {
        // Previous attempt failed but is retryable
        // Try to reclaim the lock atomically
        const reclaimResult = await client.set(
          redisKey,
          JSON.stringify(processingPayload),
          "EX",
          PROCESSING_TIMEOUT_SECONDS,
          "XX", // Only set if key exists (reclaim existing key)
        );

        if (reclaimResult === "OK") {
          // Reclaimed lock - proceed with retry
          return next.handle().pipe(
            tap((responseBody) => {
              const response = context.switchToHttp().getResponse();
              const cachedHeaders: Record<string, string> = {};

              for (const header of REPLAYABLE_HEADERS) {
                const value = response.getHeader(header);
                if (value !== undefined) {
                  cachedHeaders[header] = String(value);
                }
              }

              const cachedResponse: CachedResponse = {
                statusCode: response.statusCode || 200,
                body: responseBody,
                headers: cachedHeaders,
              };

              const completedPayload: IdempotencyRecord = {
                state: IdempotencyState.COMPLETED,
                response: cachedResponse,
              };

              client
                .set(
                  redisKey,
                  JSON.stringify(completedPayload),
                  "EX",
                  DEFAULT_TTL_SECONDS,
                )
                .catch((err: Error) => {
                  console.error("Failed to cache idempotency response:", err);
                });
            }),
            catchError((error) => {
              const isRetryable = this.isRetryableError(error);

              if (isRetryable) {
                const retryAfterTimestamp = Date.now() + 30_000;
                const failedPayload: IdempotencyRecord = {
                  state: IdempotencyState.FAILED_RETRYABLE,
                  retryAfter: retryAfterTimestamp,
                };

                client
                  .set(
                    redisKey,
                    JSON.stringify(failedPayload),
                    "EX",
                    DEFAULT_TTL_SECONDS,
                  )
                  .catch((err: Error) => {
                    console.error(
                      "Failed to set idempotency failed state:",
                      err,
                    );
                  });
              } else {
                client.del(redisKey).catch((err: Error) => {
                  console.error("Failed to delete idempotency key:", err);
                });
              }

              return throwError(() => error);
            }),
          );
        }

        // Could not reclaim - check retry timing
        if (parsed.retryAfter && Date.now() < parsed.retryAfter) {
          const response = context.switchToHttp().getResponse();
          const retryAfterSeconds = Math.ceil(
            (parsed.retryAfter - Date.now()) / 1000,
          );
          response.setHeader("Retry-After", retryAfterSeconds.toString());
          response.setHeader("X-Idempotency-State", "FAILED_RETRYABLE");

          throw new ConflictException(
            `Request with idempotency key '${idempotencyKey}' previously failed. Retry after ${retryAfterSeconds} seconds.`,
          );
        }

        // Retry window passed - allow fresh attempt
        await client.del(redisKey);
        throw new ConflictException(
          `Request with idempotency key '${idempotencyKey}' retry window expired. Please submit a new request.`,
        );
      }

      default:
        // Unknown state - delete and allow retry
        await client.del(redisKey);
        throw new ConflictException(
          `Request with idempotency key '${idempotencyKey}' has unknown state. Please retry.`,
        );
    }
  }

  /**
   * Determine if an error is retryable (transient failure)
   */
  private isRetryableError(error: unknown): boolean {
    if (error instanceof HttpException) {
      const status = error.getStatus();
      // 5xx errors and 429 (rate limit) are retryable
      return status >= 500 || status === 429;
    }

    // Network errors are retryable
    if (error && typeof error === "object" && "code" in error) {
      const code = (error as { code: string }).code;
      return ["ECONNRESET", "ETIMEDOUT", "ECONNREFUSED", "ENOTFOUND"].includes(
        code,
      );
    }

    return false;
  }
}
