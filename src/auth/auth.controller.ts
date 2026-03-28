import {
  Controller,
  Post,
  Body,
  Req,
  ForbiddenException,
  BadRequestException,
  UseGuards,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOkResponse,
  ApiExtraModels,
  getSchemaPath,
} from "@nestjs/swagger";
import { ThrottlerGuard } from "@nestjs/throttler";
import { AuthService } from "./auth.service";
import { AdminLoginDto } from "../dto/admin.dto";
import { AuditService } from "../services/audit.service";
import { Request } from "express";
import { ConfigService } from "@nestjs/config";
import { ApiResponseDto } from "../common/dto/api-response.dto";
import { LoginDto, LoginResponseDto } from "./dto/login.dto";
import { RegisterDriverDto } from "./dto/register-driver.dto";

@ApiTags("Auth")
@ApiExtraModels(ApiResponseDto, LoginResponseDto)
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
  @UseGuards(ThrottlerGuard)
  @Post("login")
  @ApiOkResponse({
    schema: {
      allOf: [
        { $ref: getSchemaPath(ApiResponseDto) },
        {
          properties: {
            data: { $ref: getSchemaPath(LoginResponseDto) },
          },
        },
      ],
    },
  })
  async login(@Body() loginDto: LoginDto) {
    const allowLegacyDriverIdLogin =
      this.configService.get("ALLOW_LEGACY_DRIVER_ID_LOGIN") === "true";

    if (!allowLegacyDriverIdLogin) {
      throw new ForbiddenException(
        "Legacy driverId login is disabled. Use Google login or secure auth flow.",
      );
    }

    const driver = await this.authService.validateDriver(loginDto.driverId);
    return this.authService.login(driver, loginDto.deviceId);
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

  /**
   * POST /auth/otp/request
   *
   * Request Email OTP:
   * {
   *   "email": "driver@example.com"
   * }
   */
  @UseGuards(ThrottlerGuard)
  @Post("otp/request")
  async requestOtp(@Body() body: { email: string }) {
    if (!body.email) {
      throw new BadRequestException("Email is required");
    }
    await this.authService.requestEmailOtp(body.email);
    return { message: "OTP sent successfully" }; // Handled by interceptor
  }

  /**
   * POST /auth/otp/verify
   *
   * Verify Email OTP & Login:
   * {
   *   "email": "driver@example.com",
   *   "otp": "123456"
   * }
   */
  @UseGuards(ThrottlerGuard)
  @Post("otp/verify")
  async verifyOtp(
    @Body() body: { email: string; otp: string },
    @Req() request: Request,
  ) {
    if (!body.email || !body.otp) {
      throw new BadRequestException("Email and OTP are required");
    }

    const result = await this.authService.verifyEmailOtp(body.email, body.otp);

    // Audit log
    if ("status" in result && result.status === "PENDING_APPROVAL") {
      await this.auditService.logFromRequest(
        request,
        "DRIVER_EMAIL_OTP_LOGIN_PENDING",
        "DRIVER",
        result.driver.id,
        {
          email: "email" in result.driver ? result.driver.email : undefined,
          status: "PENDING_APPROVAL",
        },
      );
    } else {
      await this.auditService.logFromRequest(
        request,
        "DRIVER_EMAIL_OTP_LOGIN",
        "DRIVER",
        result.driver.id,
        {
          email: "email" in result.driver ? result.driver.email : undefined,
          authProvider: "email_otp",
        },
      );
    }

    return result;
  }

  /**
   * POST /auth/register
   *
   * Register driver profile after OTP verification:
   * {
   *   "email": "driver@example.com",
   *   "name": "John Doe",
   *   "phone": "+911234567890",
   *   "cityId": "uuid",
   *   "vehicleType": "Bike",
   *   "vehicleNumber": "MH01AB1234"
   * }
   */
  @UseGuards(ThrottlerGuard)
  @Post("register")
  async register(
    @Body() body: { email: string } & RegisterDriverDto,
    @Req() request: Request,
  ) {
    if (!body.email) {
      throw new BadRequestException("Email is required");
    }

    const { email, ...dto } = body;
    const result = await this.authService.registerDriver(email, dto);

    // Audit log
    await this.auditService.logFromRequest(
      request,
      "DRIVER_REGISTER",
      "DRIVER",
      result.driver.id,
      {
        email: result.driver.email,
        name: result.driver.name,
        phone: result.driver.phone,
        cityId: result.driver.cityId,
      },
    );

    return result;
  }
}
