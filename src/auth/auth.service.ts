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

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly driversService: DriversService,
    public readonly adminService: AdminService,
    private readonly googleAuthService: GoogleAuthService,
    private readonly redisService: RedisService,
    private readonly mailerService: MailerService,
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
    console.log("DEBUG STEP 1 - requestEmailOtp called");
    console.log("DEBUG STEP 2 - mailerService:", this.mailerService);

    const otp = randomInt(100000, 1000000).toString(); // 6 digit OTP - cryptographically secure

    // Store in Redis with a 5-minute TTL
    await this.redisService
      .getClient()
      .setex(`auth:otp:${email.toLowerCase()}`, 300, otp);

    console.log("DEBUG STEP 3 - calling mailer");

    // Send OTP via email (BuyLitsRiders branded template)
    await this.mailerService.sendOtpEmail(email, otp);

    console.log("DEBUG STEP 4 - mailer finished");
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

    let driver = await this.driversService.findByEmail(normalizedEmail);

    if (!driver) {
      // Create pending driver if they don't exist
      driver = await this.driversService.createGooglePendingDriver({
        name: "Driver",
        email: normalizedEmail,
        googleSub: normalizedEmail,
      });
    }

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

    // Update driver profile
    driver.name = dto.name;
    driver.phone = dto.phone;
    driver.cityId = dto.cityId;
    driver.vehicleType = dto.vehicleType;
    driver.vehicleNumber = dto.vehicleNumber;
    driver.authProvider = "email";

    const savedDriver = await this.driversService.save(driver);

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
      profileComplete: true,
      isApproved: savedDriver.isActive,
      status: savedDriver.isActive ? savedDriver.status : "PENDING_APPROVAL",
    };
  }
}
