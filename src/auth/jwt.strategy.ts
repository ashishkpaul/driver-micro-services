import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { RolePermissions } from './permissions';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'driver-service-secret',
    });
  }

  async validate(payload: any) {
    try {
      if (payload.role === 'SYSTEM' || payload.type === 'system') {
        return {
          role: 'SYSTEM',
          type: 'system',
          sub: payload.sub || 'system',
          permissions: payload.permissions || RolePermissions.SYSTEM,
        };
      }

      // Check if it's a driver token
      if (payload.driverId) {
        return {
          driverId: payload.driverId,
          sub: payload.sub,
          type: 'driver',
          role: payload.role || 'DRIVER',
          email: payload.email,
          permissions: payload.permissions || RolePermissions.DRIVER,
          isActive: payload.isActive,
          status: payload.status,
          cityId: payload.cityId,
          zoneId: payload.zoneId,
          deviceId: payload.deviceId,
        };
      }
      
      // Check if it's an admin token
      if (payload.userId && payload.role) {
        const permissions = RolePermissions[payload.role as keyof typeof RolePermissions] || [];
        
        return {
          userId: payload.userId,
          email: payload.email,
          role: payload.role,
          cityId: payload.cityId,
          sub: payload.sub,
          type: 'admin',
          permissions: payload.permissions || permissions,
          isActive: payload.isActive,
        };
      }

      throw new UnauthorizedException('Invalid token payload');
    } catch (error) {
      throw new UnauthorizedException(
        'Token validation failed: ' + error.message,
      );
    }
  }
}
