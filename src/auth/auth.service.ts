import {
  Injectable,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { DriversService } from "../drivers/drivers.service";
import { Driver } from "../drivers/entities/driver.entity";
import { AdminService } from "../services/admin.service";
import { AdminUser } from "../entities/admin-user.entity";
import { AdminLoginDto } from "../dto/admin.dto";
import { Role } from "./roles.enum";
import { GoogleAuthService } from "./google-auth.service";
import { RolePermissions } from "./permissions";
import { RedisService } from "../redis/redis.service";

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly driversService: DriversService,
    public readonly adminService: AdminService,
    private readonly googleAuthService: GoogleAuthService,
    private readonly redisService: RedisService,
  ) {}

  /**
   * Validate driver credentials.
   * v1 assumption: driver authenticates with driverId only
   * (extend later with OTP / password / device binding).
   */
  async validateDriver(driverId: string): Promise<Driver> {
    const driver = await this.driversService.findById(driverId);

    if (!driver) {
      throw new UnauthorizedException("Invalid driver");
    }

    // isActive = admin disable flag ONLY
    if (driver.isActive === false) {
      throw new UnauthorizedException("Driver disabled");
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
  async login(driver: Driver, deviceId?: string) {
    const payload = {
      driverId: driver.id,
      sub: driver.id,
      type: "driver",
      role: Role.DRIVER,
      email: driver.email,
      permissions: RolePermissions.DRIVER,
      isActive: driver.isActive,
      status: driver.status,
      cityId: driver.cityId,
      zoneId: driver.zoneId,
      deviceId,
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
    const permissions =
      RolePermissions[admin.role as keyof typeof RolePermissions] || [];

    const payload = {
      userId: admin.id,
      email: admin.email,
      role: admin.role,
      cityId: admin.cityId,
      sub: admin.id,
      type: "admin",
      permissions,
      isActive: admin.isActive,
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

    throw new UnauthorizedException("Invalid token");
  }

  /**
   * Check if user is admin
   */
  isAdmin(user: any): boolean {
    return (
      user && user.role && [Role.ADMIN, Role.SUPER_ADMIN].includes(user.role)
    );
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

  /**
   * Login driver with Google SSO
   */
  async loginWithGoogle(idToken: string) {
    const googleUser = await this.googleAuthService.verifyIdToken(idToken);

    let driver = await this.driversService.findByGoogleSub(
      googleUser.googleSub,
    );

    // If not found, create a pending driver (inactive by default - admin must activate)
    if (!driver) {
      driver = await this.driversService.createGooglePendingDriver({
        name: googleUser.name ?? "Driver",
        email: googleUser.email,
        googleSub: googleUser.googleSub,
      });
    }

    if (!driver.isActive) {
      return {
        status: "PENDING_APPROVAL",
        driver: {
          id: driver.id,
          name: driver.name,
          email: driver.email,
        },
      };
    }

    const payload = {
      driverId: driver.id,
      sub: driver.id,
      type: "driver",
      role: Role.DRIVER,
      email: driver.email,
      permissions: RolePermissions.DRIVER,
      isActive: driver.isActive,
      status: driver.status,
      cityId: driver.cityId,
      zoneId: driver.zoneId,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      driver,
    };
  }

  /**
   * Request Email OTP
   */
  async requestEmailOtp(email: string): Promise<void> {
    const otp = Math.floor(100000 + Math.random() * 900000).toString(); // 6 digit OTP

    // Store in Redis with a 5-minute TTL
    await this.redisService
      .getClient()
      .setex(`auth:otp:${email.toLowerCase()}`, 300, otp);

    // TODO: Integrate actual email provider (SendGrid/AWS SES) here.
    console.log(`[DEV MODE] OTP for ${email} is ${otp}`);
  }

  /**
   * Verify Email OTP & Login
   */
  async verifyEmailOtp(email: string, otp: string) {
    const normalizedEmail = email.toLowerCase();
    const storedOtp = await this.redisService
      .getClient()
      .get(`auth:otp:${normalizedEmail}`);

    if (!storedOtp || storedOtp !== otp) {
      throw new UnauthorizedException("Invalid or expired OTP");
    }

    // Clean up OTP to prevent reuse
    await this.redisService.getClient().del(`auth:otp:${normalizedEmail}`);

    let driver = await this.driversService.findByGoogleSub(normalizedEmail); // Assuming you add findByEmail

    if (!driver) {
      // Create pending driver if they don't exist
      driver = await this.driversService.createGooglePendingDriver({
        name: "Driver",
        email: normalizedEmail,
        googleSub: normalizedEmail,
      });
    }

    if (!driver.isActive) {
      return {
        status: "PENDING_APPROVAL",
        driver: { id: driver.id, email: driver.email },
      };
    }

    return this.login(driver);
  }
}
