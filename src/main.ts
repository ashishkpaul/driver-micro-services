import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import helmet from "helmet";
import compression from "compression";
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

  const configService = app.get(ConfigService);

  // Security & middleware
  app.use(helmet());
  app.use(compression());
  app.enableCors({
    origin: configService.get("CORS_ORIGINS", "").split(","),
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

  // Health check endpoint
  app.getHttpAdapter().get("/health", (req, res) => {
    res.json({
      status: "healthy",
      service: "driver-service",
      version: "1.0.0",
    });
  });

  await app.listen(configService.get("PORT", 3001));
  logger.info(
    `Driver Service running on port ${configService.get("PORT", 3001)}`,
  );
}

bootstrap().catch((error) => {
  console.error("Bootstrap failed:", error);
  process.exit(1);
});
