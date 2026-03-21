import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { TypeOrmModuleOptions } from "@nestjs/typeorm";
import { databaseConfig } from "../config/database.config";
import { ConfigService } from "@nestjs/config";

import { DomainEventsModule } from "../domain-events/domain-events.module";
import { CleanupWorker } from "./cleanup.worker";
import { WebhooksModule } from "../webhooks/webhooks.module";
import { PushModule } from "../push/push.module";
import { WebSocketModule } from "../websocket/websocket.module";
import { DeadLetterWorker } from "./dead-letter.worker";
import { ServicesModule } from "../services/services.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env.local", ".env"],
    }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService): TypeOrmModuleOptions =>
        ({
          ...databaseConfig,
          host: config.get<string>("DB_HOST"),
          port: Number(config.get("DB_PORT")),
          username: config.get<string>("DB_USER"),
          password: config.get<string>("DB_PASSWORD"),
          database: config.get<string>("DB_NAME"),
          schema: "public",
          synchronize: false,
          migrationsRun: false,
          logging: config.get("DB_LOGGING") === "true",
          autoLoadEntities: true,
        }) as TypeOrmModuleOptions,
    }),
    DomainEventsModule,
    WebhooksModule,
    PushModule,
    WebSocketModule,
    ServicesModule,
  ],
  providers: [DeadLetterWorker, CleanupWorker],
})
export class WorkerModule {}
