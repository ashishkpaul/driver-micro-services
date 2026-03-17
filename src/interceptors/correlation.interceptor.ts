import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import { v4 as uuid } from "uuid";
import { trace } from "@opentelemetry/api";

@Injectable()
export class CorrelationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();

    // Get or create correlation ID
    request.correlationId = request.headers["x-correlation-id"] || uuid();

    // Get current trace context
    const currentSpan = trace.getActiveSpan();
    if (currentSpan) {
      const spanContext = currentSpan.spanContext();
      request.traceId = spanContext.traceId;
      request.spanId = spanContext.spanId;
    }

    return next.handle().pipe(
      tap({
        next: () => {
          // Add correlation ID to response headers
          const response = context.switchToHttp().getResponse();
          response.setHeader("x-correlation-id", request.correlationId);
          if (request.traceId) {
            response.setHeader("x-trace-id", request.traceId);
          }
        },
      }),
    );
  }
}
