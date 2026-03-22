import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  ConflictException,
  BadRequestException,
} from "@nestjs/common";
import { RedisService } from "../../redis/redis.service";
import { Observable } from "rxjs";

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
    // If you want to FORCE all POSTs to have a key, throw a BadRequestException here.
    if (!idempotencyKey) {
      return next.handle();
    }

    const redisKey = `idempotency:rest:${idempotencyKey}`;
    const client = this.redis.getClient();

    // Attempt to set the key with a 24-hour TTL (86400 seconds)
    // 'NX' ensures it only sets if the key does not already exist
    const result = await client.set(redisKey, "LOCKED", "EX", 86400, "NX");

    if (!result) {
      throw new ConflictException(
        `Request with idempotency key '${idempotencyKey}' is already being processed or has been completed.`,
      );
    }

    return next.handle();
  }
}
