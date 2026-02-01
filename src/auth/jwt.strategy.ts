import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthService } from './auth.service';
import { Driver } from '../drivers/entities/driver.entity';
import { AdminUser } from '../entities/admin-user.entity';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly authService: AuthService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'driver-service-secret',
    });
  }

  async validate(payload: any) {
    try {
      // Check if it's a driver token
      if (payload.driverId) {
        const driver = await this.authService.validateDriver(payload.driverId);
        return {
          driverId: driver.id,
          sub: payload.sub,
          type: 'driver',
        };
      }
      
      // Check if it's an admin token
      if (payload.userId && payload.role) {
        const admin = await this.authService.adminService.findById(payload.userId);
        return {
          userId: admin.id,
          email: admin.email,
          role: admin.role,
          cityId: admin.cityId,
          sub: payload.sub,
          type: 'admin',
        };
      }

      throw new Error('Invalid token payload');
    } catch (error) {
      throw new Error('Token validation failed: ' + error.message);
    }
  }
}
