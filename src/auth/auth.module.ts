import { Module, MiddlewareConsumer } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { DriversModule } from '../drivers/drivers.module';
import { AdminModule } from '../modules/admin.module';
import { GoogleAuthService } from './google-auth.service';
import { PolicyGuard, RequirePermissions } from './policy.guard';
import { PermissionInjectionMiddleware } from './permission-injection.middleware';
import { AuthorizationAuditService } from './authorization-audit.service';
import { AuthorizationModule } from '../authorization/authorization.module';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'driver-service-secret',
      signOptions: { expiresIn: '24h' },
    }),
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
  ],
  exports: [AuthService, PolicyGuard, RequirePermissions, PermissionInjectionMiddleware],
})
export class AuthModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(PermissionInjectionMiddleware)
      .forRoutes('*'); // Apply to all routes that use JWT authentication
  }
}
