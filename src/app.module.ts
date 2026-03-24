import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { TypeOrmModule } from "@nestjs/typeorm";
import { TypeOrmModuleOptions } from "@nestjs/typeorm";
import { ThrottlerModule } from "@nestjs/throttler";
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
import { ScheduleModule } from "@nestjs/schedule";
import { DomainEventsApiModule } from "./domain-events/domain-events.module";
import { SchemaModule } from "./schema/schema.module";
import { BootstrapModule } from "./bootstrap/bootstrap.module";
import { ObservabilityModule } from "./observability/observability.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [".env.local", ".env"],
    }),
    ThrottlerModule.forRoot([
      {
        ttl: 60000, // 60 seconds
        limit: 10, // 10 requests per minute
      },
    ]),
    ScheduleModule.forRoot(),
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
    AuthModule,
    AdminModule,
    WebSocketModule,
    HealthModule,
    DriversModule,
    DeliveriesModule,
    AssignmentModule,
    EventsModule,
    WebhooksModule,
    DomainEventsApiModule,
    BootstrapModule,
    ObservabilityModule,
  ],
  providers: [],
})
export class AppModule {}
