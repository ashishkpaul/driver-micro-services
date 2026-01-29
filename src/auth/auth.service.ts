import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DriversService } from '../drivers/drivers.service';
import { Driver } from '../drivers/entities/driver.entity';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly driversService: DriversService,
  ) {}

  /**
   * Validate driver credentials.
   * v1 assumption: driver authenticates with driverId only
   * (extend later with OTP / password / device binding).
   */
  async validateDriver(driverId: string): Promise<Driver> {
    const driver = await this.driversService.findById(driverId);

    if (!driver) {
      throw new UnauthorizedException('Invalid driver');
    }

    // isActive = admin disable flag ONLY
    if (driver.isActive === false) {
      throw new UnauthorizedException('Driver disabled');
    }

    return driver;
  }

  /**
   * Issue JWT for driver (used by PWA and WebSocket auth)
   */
  async login(driver: Driver) {
    const payload = {
      driverId: driver.id,
      sub: driver.id,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      driver: {
        id: driver.id,
        name: driver.name,
      },
    };
  }
}
