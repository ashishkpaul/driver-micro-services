import { Module, MiddlewareConsumer } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import { PassportModule } from "@nestjs/passport";
import { RedisModule } from "../redis/redis.module";
import { AuthService } from "./auth.service";
import { AuthController } from "./auth.controller";
import { JwtStrategy } from "./jwt.strategy";
import { DriversModule } from "../drivers/drivers.module";
import { AdminModule } from "../modules/admin.module";
import { GoogleAuthService } from "./google-auth.service";
import { PolicyGuard } from "./policy.guard";
import { PermissionInjectionMiddleware } from "./permission-injection.middleware";
import { AuthorizationAuditService } from "./authorization-audit.service";
import { AuthorizationModule } from "../authorization/authorization.module";
import { MailerService } from "../services/mailer.service";

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || "driver-service-secret",
      signOptions: { expiresIn: "24h" },
    }),
    RedisModule,
    DriversModule,
    AdminModule,
    AuthorizationModule,
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    GoogleAuthService,
    PolicyGuard,
    PermissionInjectionMiddleware,
    AuthorizationAuditService,
    MailerService,
  ],
  exports: [
    AuthService,
    PolicyGuard,
    PermissionInjectionMiddleware,
    MailerService,
  ],
})
export class AuthModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(PermissionInjectionMiddleware).forRoutes("*"); // Apply to all routes that use JWT authentication
  }
}
