# Distributed Tracing Implementation

## Overview

This document describes the implementation of distributed tracing using OpenTelemetry in the Driver Microservices system. The tracing setup enables end-to-end observability across API → Worker → Webhook → External services.

## Architecture

### Components

1. **OpenTelemetry SDK**: Automatic instrumentation for all HTTP, database, and Redis operations
2. **Jaeger**: Distributed tracing backend and UI
3. **Correlation Interceptor**: Adds correlation IDs to HTTP requests
4. **Tracing Interceptor**: Auto-instruments HTTP requests with spans
5. **Outbox Worker**: Traces job execution and event processing

### Flow

```
HTTP Request
    ↓
TracingInterceptor (creates span)
    ↓
Service Layer
    ↓
Outbox write (same trace)
    ↓
OutboxWorker (continues trace)
    ↓
Event handler span
    ↓
Redis / WebSocket span
    ↓
Webhook calls (with traceparent header)
```

## Setup

### 1. Dependencies

Added to `package.json`:

```json
{
  "@opentelemetry/api": "^1.9.0",
  "@opentelemetry/sdk-node": "^0.52.0",
  "@opentelemetry/auto-instrumentations-node": "^0.52.0"
}
```

### 2. Tracing Bootstrap

Created `src/observability/tracing.ts`:

```typescript
import { NodeSDK } from "@opentelemetry/sdk-node";
import { Resource } from "@opentelemetry/resources";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";

const sdk = new NodeSDK({
  resource: new Resource({
    [SemanticResourceAttributes.SERVICE_NAME]: "driver-service",
    [SemanticResourceAttributes.SERVICE_VERSION]: "1.0.0",
  }),
  instrumentations: [getNodeAutoInstrumentations()],
});

sdk.start();
```

### 3. Application Integration

#### Main Application (`src/main.ts`)

```typescript
import "./observability/tracing";
// ... rest of main.ts
```

#### Worker (`src/worker.ts`)

```typescript
import "./observability/tracing";
// ... rest of worker.ts
```

### 4. Docker Compose

Added Jaeger service to `docker-compose.yml`:

```yaml
jaeger:
  image: jaegertracing/all-in-one:1.57
  ports:
    - "16686:16686"  # Jaeger UI
    - "14268:14268"  # Jaeger HTTP collector
  environment:
    - COLLECTOR_OTLP_ENABLED=true
```

## Features

### 1. Automatic Instrumentation

The `getNodeAutoInstrumentations()` automatically instruments:
- HTTP requests (Express, Axios)
- Database operations (TypeORM, PostgreSQL)
- Redis operations (ioredis)
- WebSocket connections
- Process metrics

### 2. Correlation IDs

The `CorrelationInterceptor` adds:
- `x-correlation-id`: Unique request identifier
- `x-trace-id`: OpenTelemetry trace ID
- `x-span-id`: Current span ID

### 3. Manual Tracing

For custom spans, use:

```typescript
import { trace } from "@opentelemetry/api";

const tracer = trace.getTracer("service-name", "1.0.0");
const span = tracer.startSpan("operation-name");
try {
  // operation
  span.setStatus({ code: SpanStatusCode.OK });
} catch (error) {
  span.recordException(error);
  span.setStatus({ code: SpanStatusCode.ERROR });
} finally {
  span.end();
}
```

### 4. Outbox Worker Tracing

The outbox worker includes:
- Batch processing spans
- Individual event processing spans
- Error tracking and retry counting
- Worker identity tracking

## Usage

### 1. Start Services

```bash
# Start with Jaeger
docker-compose up -d

# Start application
npm run start:dev
```

### 2. View Traces

Open Jaeger UI: http://localhost:16686

### 3. Search Traces

- Service: `driver-service`
- Operation: Filter by specific operations
- Tags: Search by correlation ID

### 4. Trace Context Propagation

HTTP requests automatically include:
- `traceparent`: W3C trace context
- `tracestate`: Additional trace state

## Monitoring

### Key Metrics

1. **Request Latency**: End-to-end request timing
2. **Error Rates**: Failed requests and operations
3. **Database Performance**: Query execution times
4. **Redis Performance**: Cache hit/miss rates
5. **Worker Performance**: Event processing times

### Alerts

Set up alerts for:
- High error rates (> 5%)
- Slow requests (> 2 seconds)
- Worker failures
- Database connection issues

## Troubleshooting

### Common Issues

1. **Missing Dependencies**: Ensure all OpenTelemetry packages are installed
2. **Port Conflicts**: Check Jaeger ports (16686, 14268)
3. **Environment Variables**: Set `JAEGER_ENDPOINT` correctly
4. **Network Issues**: Ensure services can reach Jaeger

### Debug Commands

```bash
# Check Jaeger status
docker-compose logs jaeger

# Verify tracing in application
curl -H "x-correlation-id: test-123" http://localhost:3001/api/health

# View traces via API
curl http://localhost:16686/api/traces?service=driver-service
```

## Performance Considerations

### Sampling

For high-traffic environments, configure sampling:

```typescript
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { JaegerExporter } from "@opentelemetry/exporter-jaeger";

const exporter = new JaegerExporter({
  endpoint: "http://jaeger:14268/api/traces",
});

const processor = new BatchSpanProcessor(exporter, {
  scheduledDelayMillis: 5000, // Send every 5 seconds
  maxExportBatchSize: 512,    // Max 512 spans per batch
  maxQueueSize: 2048,         // Max 2048 spans in queue
});
```

### Resource Limits

Monitor resource usage:
- Memory: OpenTelemetry adds ~10-20MB overhead
- CPU: Minimal impact with batching
- Network: Depends on trace volume

## Future Enhancements

1. **Custom Metrics**: Add business-specific metrics
2. **Log Correlation**: Link logs to traces
3. **Alerting**: Integrate with monitoring systems
4. **Performance Optimization**: Fine-tune sampling rates
5. **Multi-Service**: Extend to other microservices

## Security

### Data Privacy

- Avoid logging sensitive data in spans
- Use span attributes for non-sensitive metadata
- Implement data retention policies

### Network Security

- Use HTTPS for trace export
- Implement authentication for Jaeger UI
- Restrict access to tracing endpoints

## Integration Points

### Webhook Calls

Webhook calls automatically include trace context:

```typescript
// Outgoing HTTP requests include traceparent header
const response = await axios.post(webhookUrl, payload);
```

### External Services

Ensure external services support trace propagation:
- Use standard `traceparent` header
- Implement trace context extraction
- Return trace context in responses

This implementation provides comprehensive observability for debugging, performance optimization, and operational monitoring of the driver microservices system.