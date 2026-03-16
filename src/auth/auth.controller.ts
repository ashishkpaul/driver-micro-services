import {
  Controller,
  Post,
  Body,
  Req,
  ForbiddenException,
} from "@nestjs/common";
import { AuthService } from "./auth.service";
import { AdminLoginDto } from "../dto/admin.dto";
import { AuditService } from "../services/audit.service";
import { Request } from "express";
import { ConfigService } from "@nestjs/config";

@Controller("auth")
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * POST /auth/login
   *
   * v1 simplified login:
   * {
   *   "driverId": "driver-uuid"
   * }
   */
  @Post("login")
  async login(@Body() body: { driverId: string; deviceId?: string }) {
    const allowLegacyDriverIdLogin =
      this.configService.get("ALLOW_LEGACY_DRIVER_ID_LOGIN") === "true";

    if (!allowLegacyDriverIdLogin) {
      throw new ForbiddenException(
        "Legacy driverId login is disabled. Use Google login or secure auth flow.",
      );
    }

    const driver = await this.authService.validateDriver(body.driverId);
    return this.authService.login(driver, body.deviceId);
  }

  /**
   * POST /auth/admin/login
   *
   * Admin login endpoint:
   * {
   *   "email": "admin@company.com",
   *   "password": "password"
   * }
   */
  @Post("admin/login")
  async adminLogin(@Body() loginDto: AdminLoginDto, @Req() request: Request) {
    const admin = await this.authService.validateAdmin(
      loginDto.email,
      loginDto.password,
    );
    const result = await this.authService.adminLogin(admin);

    // Audit log
    await this.auditService.logFromRequest(
      request,
      "ADMIN_LOGIN",
      "ADMIN",
      admin.id,
      { email: admin.email },
    );

    return result;
  }

  /**
   * POST /auth/google
   *
   * Google SSO login endpoint:
   * {
   *   "idToken": "GOOGLE_ID_TOKEN"
   * }
   */
  @Post("google")
  async googleLogin(@Body("idToken") idToken: string, @Req() request: Request) {
    const result = await this.authService.loginWithGoogle(idToken);

    // Audit log
    if (result.status === "PENDING_APPROVAL") {
      await this.auditService.logFromRequest(
        request,
        "DRIVER_GOOGLE_LOGIN_PENDING",
        "DRIVER",
        result.driver.id,
        { email: result.driver.email, status: "PENDING_APPROVAL" },
      );
    } else {
      await this.auditService.logFromRequest(
        request,
        "DRIVER_GOOGLE_LOGIN",
        "DRIVER",
        result.driver.id,
        { email: result.driver.email, authProvider: "google" },
      );
    }

    return result;
  }
}
