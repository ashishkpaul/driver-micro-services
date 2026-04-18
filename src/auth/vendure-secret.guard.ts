import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/** Allows requests that carry the correct X-Webhook-Secret header (Vendure internal calls). */
@Injectable()
export class VendureSecretGuard implements CanActivate {
  private readonly secret: string;

  constructor(private readonly configService: ConfigService) {
    this.secret = this.configService.get<string>('VENDURE_TO_DRIVER_SECRET') ?? '';
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const header = req.headers['x-webhook-secret'];
    if (!header || header !== this.secret) {
      throw new UnauthorizedException('Invalid service secret');
    }
    return true;
  }
}
