import {
  CanActivate,
  ExecutionContext,
  Injectable,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { WsException } from '@nestjs/websockets';
import { Socket } from 'socket.io';

@Injectable()
export class WebSocketJwtGuard implements CanActivate {
  private readonly logger = new Logger(WebSocketJwtGuard.name);

  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const client: Socket = context.switchToWs().getClient();

    try {
      const token = this.extractToken(client);
      if (!token) {
        throw new WsException('Missing auth token');
      }

      const payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_SECRET || 'driver-service-secret',
      });

      client.data.driverId = payload.driverId;

      this.logger.log(`WS authenticated driver ${payload.driverId}`);
      return true;
    } catch (err) {
      this.logger.error('WS auth failed', err);
      throw new WsException('Unauthorized');
    }
  }

  private extractToken(client: Socket): string | null {
    // ✅ socket.io auth
    if (client.handshake.auth?.token) {
      return client.handshake.auth.token;
    }

    // ✅ query string fallback
    if (typeof client.handshake.query?.token === 'string') {
      return client.handshake.query.token;
    }

    return null;
  }
}
