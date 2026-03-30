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
import { JwtPayload } from "./jwt-payload.types";
import { randomInt } from "crypto";
import { MailerService } from "../services/mailer.service";
import { RegisterDriverDto } from "./dto/register-driver.dto";
import { DriverRegistrationService } from "../drivers/driver-registration.service";

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly driversService: DriversService,
    public readonly adminService: AdminService,
    private readonly googleAuthService: GoogleAuthService,
    private readonly redisService: RedisService,
    private readonly mailerService: MailerService,
    private readonly driverRegistrationService: DriverRegistrationService,
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
      accessToken: this.jwtService.sign(payload, {
        expiresIn: "12h",
      }),
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
      accessToken: this.jwtService.sign(payload, {
        expiresIn: "8h",
      }),
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
  async validateUser(payload: JwtPayload): Promise<Driver | AdminUser> {
    if (payload.type === "driver" && "driverId" in payload) {
      // Driver authentication
      return this.validateDriver(payload.driverId);
    } else if (payload.type === "admin" && "userId" in payload) {
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
      accessToken: this.jwtService.sign(payload, {
        expiresIn: "12h",
      }),
      driver,
    };
  }

  /**
   * Request Email OTP
   */
  async requestEmailOtp(email: string): Promise<void> {
    const normalizedEmail = email.toLowerCase();

    // Check if this email belongs to an admin - admins must use password login
    const adminUser = await this.adminService.findByEmailSafe(normalizedEmail);
    if (adminUser) {
      throw new BadRequestException(
        "Admin accounts must use password login. Please use the admin login page.",
      );
    }

    const otp = randomInt(100000, 1000000).toString(); // 6 digit OTP - cryptographically secure

    // Store in Redis with a 5-minute TTL
    await this.redisService
      .getClient()
      .setex(`auth:otp:${normalizedEmail}`, 300, otp);

    // Send OTP via email (BuyLitsRiders branded template)
    await this.mailerService.sendOtpEmail(email, otp);
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

    // Use DriverRegistrationService to create or find driver
    let driver =
      await this.driverRegistrationService.createDriverFromAuth(
        normalizedEmail,
      );

    // Clean up OTP only after successful verification/creation
    await this.redisService.getClient().del(`auth:otp:${normalizedEmail}`);

    const profileComplete = !!(driver.name && driver.phone && driver.cityId);

    if (!driver.isActive) {
      return {
        status: "PENDING_APPROVAL",
        driver: { id: driver.id, email: driver.email },
        profileComplete,
        isApproved: false,
      };
    }

    const loginResult = await this.login(driver);
    return {
      ...loginResult,
      profileComplete,
      isApproved: true,
    };
  }

  /**
   * Register driver profile after OTP verification
   */
  async registerDriver(email: string, dto: RegisterDriverDto) {
    const normalizedEmail = email.toLowerCase();
    const driver = await this.driversService.findByEmail(normalizedEmail);

    if (!driver) {
      throw new UnauthorizedException(
        "Please verify OTP first before registering",
      );
    }

    // Use DriverRegistrationService to complete profile
    const savedDriver = await this.driverRegistrationService.completeProfile(
      driver.id,
      {
        name: dto.name,
        phone: dto.phone,
        cityId: dto.cityId,
        vehicleType: dto.vehicleType,
        vehicleNumber: dto.vehicleNumber,
      },
    );

    const profileComplete =
      await this.driverRegistrationService.isProfileComplete(savedDriver.id);

    return {
      driver: {
        id: savedDriver.id,
        name: savedDriver.name,
        email: savedDriver.email,
        phone: savedDriver.phone,
        cityId: savedDriver.cityId,
        vehicleType: savedDriver.vehicleType,
        vehicleNumber: savedDriver.vehicleNumber,
        isActive: savedDriver.isActive,
        status: savedDriver.status,
      },
      profileComplete,
      isApproved: savedDriver.isActive,
      status: savedDriver.isActive ? savedDriver.status : "PENDING_APPROVAL",
    };
  }

  /**
   * Get driver profile for session introspection (/auth/me)
   */
  async getDriverProfile(driverId: string) {
    const driver = await this.driversService.findById(driverId);

    if (!driver) {
      throw new NotFoundException("Driver not found");
    }

    return {
      id: driver.id,
      name: driver.name,
      email: driver.email,
      phone: driver.phone,
      cityId: driver.cityId,
      zoneId: driver.zoneId,
      vehicleType: driver.vehicleType,
      vehicleNumber: driver.vehicleNumber,
      isActive: driver.isActive,
      status: driver.status,
      registrationStatus: driver.registrationStatus,
    };
  }

  /**
   * Get admin profile for session introspection (/auth/me)
   */
  async getAdminProfile(userId: string) {
    const admin = await this.adminService.findById(userId);

    if (!admin) {
      throw new NotFoundException("Admin not found");
    }

    return admin.toResponseDto();
  }
}
