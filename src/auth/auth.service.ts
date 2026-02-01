import { Injectable, UnauthorizedException, NotFoundException, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DriversService } from '../drivers/drivers.service';
import { Driver } from '../drivers/entities/driver.entity';
import { AdminService } from '../services/admin.service';
import { AdminUser } from '../entities/admin-user.entity';
import { AdminLoginDto } from '../dto/admin.dto';
import { Role } from './roles.enum';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly driversService: DriversService,
    public readonly adminService: AdminService,
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
   * Validate admin credentials
   */
  async validateAdmin(email: string, password: string): Promise<AdminUser> {
    return this.adminService.validateAdmin(email, password);
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

  /**
   * Issue JWT for admin
   */
  async adminLogin(admin: AdminUser) {
    const payload = {
      userId: admin.id,
      email: admin.email,
      role: admin.role,
      cityId: admin.cityId,
      sub: admin.id,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      admin: {
        id: admin.id,
        email: admin.email,
        role: admin.role,
        cityId: admin.cityId,
      },
    };
  }

  /**
   * Admin login with email and password
   */
  async adminLoginWithCredentials(loginDto: AdminLoginDto) {
    const admin = await this.validateAdmin(loginDto.email, loginDto.password);
    return this.adminLogin(admin);
  }

  /**
   * Validate any user (driver or admin) based on JWT payload
   */
  async validateUser(payload: any): Promise<Driver | AdminUser> {
    if (payload.driverId) {
      // Driver authentication
      return this.validateDriver(payload.driverId);
    } else if (payload.userId && payload.role) {
      // Admin authentication
      return this.adminService.findById(payload.userId);
    }

    throw new UnauthorizedException('Invalid token');
  }

  /**
   * Check if user is admin
   */
  isAdmin(user: any): boolean {
    return user && user.role && [Role.ADMIN, Role.SUPER_ADMIN].includes(user.role);
  }

  /**
   * Check if user is superadmin
   */
  isSuperAdmin(user: any): boolean {
    return user && user.role === Role.SUPER_ADMIN;
  }

  /**
   * Check if admin can access a specific city
   */
  canAccessCity(admin: AdminUser, cityId: string): boolean {
    return admin.canAccessCity(cityId);
  }
}
