import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { TypeOrmModuleOptions } from "@nestjs/typeorm";
import { DriversModule } from "./drivers/drivers.module";
import { DeliveriesModule } from "./deliveries/deliveries.module";
import { AssignmentModule } from "./assignment/assignment.module";
import { EventsModule } from "./events/events.module";
import { WebhooksModule } from "./webhooks/webhooks.module";
import { ConfigService } from "@nestjs/config";

import { databaseConfig } from "./config/database.config";
import { HealthModule } from "./health/health.module";
import { WebSocketModule } from "./websocket/websocket.module";
import { AuthModule } from "./auth/auth.module";
import { AdminModule } from "./modules/admin.module";

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
          synchronize: config.get("DB_SYNCHRONIZE") === "true",
          logging: config.get("DB_LOGGING") === "true",
        }) as TypeOrmModuleOptions,
    }),
    AuthModule,
    WebSocketModule,
    HealthModule,
    DriversModule,
    DeliveriesModule,
    AssignmentModule,
    EventsModule,
    WebhooksModule,
  ],
  providers: [],
})
export class AppModule {}
