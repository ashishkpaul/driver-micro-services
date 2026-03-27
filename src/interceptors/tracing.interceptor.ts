import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from "@nestjs/common";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import {
  trace,
  context as otelContext,
  SpanStatusCode,
  SpanKind,
} from "@opentelemetry/api";

@Injectable()
export class TracingInterceptor implements NestInterceptor {
  private readonly tracer = trace.getTracer("driver-micro-services", "1.0.0");

  intercept(
    executionContext: ExecutionContext,
    next: CallHandler,
  ): Observable<any> {
    const request = executionContext.switchToHttp().getRequest();
    const response = executionContext.switchToHttp().getResponse();
    const startTime = Date.now();

    // Create a span for the HTTP request
    const span = this.tracer.startSpan(
      `${request.method} ${request.route?.path || request.url}`,
      {
        kind: SpanKind.SERVER,
        attributes: {
          "http.method": request.method,
          "http.url": request.url,
          "http.user_agent": request.get("user-agent"),
          "http.client_ip": request.ip || request.socket?.remoteAddress,
        },
      },
    );

    // Set trace context
    const ctx = trace.setSpan(otelContext.active(), span);
    const traceId = span.spanContext().traceId;

    return otelContext.with(ctx, () =>
      next.handle().pipe(
        tap({
          next: (data) => {
            const duration = Date.now() - startTime;
            span.setAttributes({
              "http.status_code": response.statusCode,
              "http.response_size": data
                ? Buffer.byteLength(JSON.stringify(data))
                : 0,
            });
            span.setStatus({ code: SpanStatusCode.OK });
            span.end();

            // Log request completion with short trace id
            console.log(
              `← ${request.method} ${request.url} ${response.statusCode} ${duration}ms [${traceId.substring(0, 8)}]`
            );
          },
          error: (error) => {
            const duration = Date.now() - startTime;
            span.recordException(error);
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: error?.message,
            });
            span.end();

            // Log request error with short trace id
            console.log(
              `← ${request.method} ${request.url} ERROR ${duration}ms [${traceId.substring(0, 8)}]`
            );
          },
        }),
      ),
    );
  }
}
