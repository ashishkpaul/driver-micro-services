import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import helmet from "helmet";
import * as compression from "compression";
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

  // Enable shutdown hooks for graceful shutdown (e.g., SIGTERM)
  app.enableShutdownHooks();

  const configService = app.get(ConfigService);

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

  // Validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const port = configService.get("PORT", 3001);
  await app.listen(port);
  logger.info(`Driver Service running on port ${port}`);

  // Handle SIGTERM for graceful shutdown in Kubernetes
  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, starting graceful shutdown');
    await app.close();
    logger.info('Graceful shutdown completed');
    process.exit(0);
  });
}

bootstrap().catch((error) => {
  console.error("Bootstrap failed:", error);
  process.exit(1);
});
