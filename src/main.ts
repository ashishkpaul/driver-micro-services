import "./observability/tracing";

import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import helmet from "helmet";
import * as compression from "compression";
import { Logger } from "winston";
import { WinstonModule } from "nest-winston";
import * as winston from "winston";
import { IoAdapter } from "@nestjs/platform-socket.io";
import { CorrelationInterceptor } from "./interceptors/correlation.interceptor";
import { TracingInterceptor } from "./interceptors/tracing.interceptor";
import { TimeoutInterceptor } from "./interceptors/timeout.interceptor";
import { ApiResponseInterceptor } from "./interceptors/api-response.interceptor";
import { GlobalExceptionFilter } from "./common/filters/global-exception.filter";
import { SystemReadinessService, StartupPhase } from "./bootstrap/system-readiness.service";
import { PushNotificationService } from "./push/push.service";

async function bootstrap() {
  // Logger setup
  const logger: Logger = winston.createLogger({
    level: "info",
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json(),
    ),
    transports: [
      new winston.transports.Console({
        format: winston.format.simple(),
      }),
      new winston.transports.File({
        filename: "logs/error.log",
        level: "error",
      }),
      new winston.transports.File({
        filename: "logs/combined.log",
      }),
    ],
  });

  const app = await NestFactory.create(AppModule, {
    logger: WinstonModule.createLogger({ instance: logger }),
  });

  // Enable shutdown hooks for graceful shutdown
  app.enableShutdownHooks();

  const configService = app.get(ConfigService);
  const readinessService = app.get(SystemReadinessService);

  // Start startup orchestration
  readinessService.startPhase(StartupPhase.INFRASTRUCTURE);

  // Security & middleware
  app.use(helmet());
  app.use(compression());

  const origins = configService
    .get<string>("CORS_ORIGINS", "")
    .split(",")
    .filter(Boolean);

  app.enableCors({
    origin: origins.length ? origins : true,
    credentials: true,
  });

  // Use Socket.IO adapter for WebSocket
  app.useWebSocketAdapter(new IoAdapter(app));

  // Complete INFRASTRUCTURE phase
  readinessService.completePhase(StartupPhase.INFRASTRUCTURE);

  // Start SCHEMA phase
  readinessService.startPhase(StartupPhase.SCHEMA);

  // Schema verification will be handled by SchemaControlPlaneService
  // The service will complete this phase when schema is verified

  // Start WORKERS phase
  readinessService.startPhase(StartupPhase.WORKERS);

  // Workers will be started by WorkerLifecycleService after READY phase
  // For now, just mark this phase as complete to allow API startup
  readinessService.completePhase(StartupPhase.WORKERS);

  // Start API phase
  readinessService.startPhase(StartupPhase.API);

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // Global interceptors
  app.useGlobalInterceptors(
    new CorrelationInterceptor(),
    new TracingInterceptor(),
    new TimeoutInterceptor(),
    new ApiResponseInterceptor(),
  );

  // Global exception filter
  app.useGlobalFilters(new GlobalExceptionFilter());

  const port = configService.get("PORT", 3001);
  await app.listen(port);
  
  // Complete API phase
  readinessService.completePhase(StartupPhase.API);

  // Start READY phase
  readinessService.startPhase(StartupPhase.READY);

  // Complete READY phase
  readinessService.completePhase(StartupPhase.READY);

  // Use the new completeBoot method for formatted summary
  readinessService.completeBoot();

  // Check push status
  const pushService = app.get(PushNotificationService);
  const pushStatus = pushService && pushService.isEnabled() ? 'ENABLED' : 'DISABLED';

  // Final startup info
  console.log('');
  console.log('┌─ 🚀 DRIVER SERVICE ' + '─'.repeat(30));
  console.log(`│  Port: ${port}`);
  console.log(`│  WebSocket: ${configService.get("WEBSOCKET_PORT", 3002)}`);
  console.log(`│  Push: ${pushStatus}`);
  console.log(`│  Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`│  Version: ${process.env.npm_package_version || '1.0.0'}`);
  console.log('└' + '─'.repeat(49));

  // Handle SIGTERM for graceful shutdown
  process.on("SIGTERM", async () => {
    logger.info("SIGTERM received, starting graceful shutdown");
    await app.close();
    logger.info("Graceful shutdown completed");
    process.exit(0);
  });
}

bootstrap().catch((error) => {
  console.error("Bootstrap failed:", error);
  process.exit(1);
});
