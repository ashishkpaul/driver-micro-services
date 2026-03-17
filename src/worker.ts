import "./observability/tracing";

import { NestFactory } from "@nestjs/core";
import { WorkerModule } from "./worker/worker.module";
import { Logger } from "winston";
import { WinstonModule } from "nest-winston";
import * as winston from "winston";

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
        filename: "logs/worker-error.log",
        level: "error",
      }),
      new winston.transports.File({
        filename: "logs/worker-combined.log",
      }),
    ],
  });

  const app = await NestFactory.create(WorkerModule, {
    logger: WinstonModule.createLogger({ instance: logger }),
  });

  // Enable shutdown hooks for graceful shutdown
  app.enableShutdownHooks();

  await app.init();

  logger.info("Outbox worker started successfully");
  logger.info(
    `Database connection info: host=${process.env.DB_HOST}, port=${process.env.DB_PORT}, db=${process.env.DB_NAME}`,
  );

  // Keep the worker alive
  process.on("SIGTERM", async () => {
    logger.info("SIGTERM received, starting graceful shutdown");
    await app.close();
    logger.info("Graceful shutdown completed");
    process.exit(0);
  });

  process.on("SIGINT", async () => {
    logger.info("SIGINT received, starting graceful shutdown");
    await app.close();
    logger.info("Graceful shutdown completed");
    process.exit(0);
  });
}

bootstrap().catch((error) => {
  console.error("Worker bootstrap failed:", error);
  process.exit(1);
});
