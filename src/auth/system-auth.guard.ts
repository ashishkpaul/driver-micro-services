// src/auth/system-auth.guard.ts
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SystemAuthGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const secret = request.headers['x-webhook-secret'];
    const serviceToken = request.headers['x-service-token'];

    // Validate webhook secret from driver service
    if (secret) {
      const expectedSecret = this.configService.get('DRIVER_TO_VENDURE_SECRET');
      if (secret !== expectedSecret) {
        throw new UnauthorizedException('Invalid webhook secret');
      }
      (request as any).systemAuth = { type: 'webhook', service: 'driver-service' };
      return true;
    }

    // Validate service-to-service token
    if (serviceToken) {
      // Validate against service registry
      // Implementation...
      (request as any).systemAuth = { type: 'service', service: 'internal' };
      return true;
    }

    throw new UnauthorizedException('Missing system authentication');
  }
}
