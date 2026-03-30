// src/controllers/admin.controller.ts
import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
  ParseUUIDPipe,
  BadRequestException,
} from "@nestjs/common";
import { AdminService } from "../services/admin.service";
import { PasswordService } from "../services/password.service";
import { AuthGuard } from "@nestjs/passport";
import {
  CreateAdminDto,
  UpdateAdminDto,
  AdminListQueryDto,
  AdminDriverListQueryDto,
} from "../dto/admin.dto";
import { AuditService } from "../services/audit.service";
import { Request } from "express";
import { PolicyGuard, RequirePermissions } from "../auth/policy.guard";
import { Permission } from "../auth/permissions";
import { AdminRole } from "../entities/admin-user.entity";
import { DriverAdminApplicationService } from "../application/driver-admin.application";

@Controller("admin/users")
@UseGuards(AuthGuard("jwt"), PolicyGuard)
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly passwordService: PasswordService,
    private readonly auditService: AuditService,
    private readonly driverAdminApplicationService: DriverAdminApplicationService,
  ) {}

  /**
   * Create new admin user (SUPER_ADMIN only)
   */
  @Post()
  @RequirePermissions(Permission.SUPER_ADMIN_CREATE_ADMIN)
  async create(
    @Body() createAdminDto: CreateAdminDto,
    @Req() request: Request & { user: any },
  ) {
    const admin = await this.adminService.create(
      createAdminDto,
      request.user.userId,
    );

    // Audit log
    await this.auditService.logFromRequest(
      request,
      "ADMIN_CREATED",
      "ADMIN",
      admin.id,
      {
        adminData: {
          email: admin.email,
          role: admin.role,
          cityId: admin.cityId,
        },
      },
    );

    return admin.toResponseDto();
  }

  /**
   * Get all admins (SUPER_ADMIN: all, ADMIN: same city)
   */
  @Get()
  @RequirePermissions(Permission.ADMIN_READ_ADMIN_ANY)
  async findAll(
    @Req() request: Request & { user: any },
    @Query() query: AdminListQueryDto,
  ) {
    const { cityId, role, skip = 0, take = 50 } = query;

    // SUPER_ADMIN can see all, ADMIN can only see their city
    let filterCityId = cityId;
    if (request.user.role === AdminRole.ADMIN && !filterCityId) {
      filterCityId = request.user.cityId;
    }

    const result = await this.adminService.findAll(
      filterCityId,
      role as AdminRole,
      skip,
      take,
    );

    return {
      admins: result.admins.map((admin) => admin.toResponseDto()),
      total: result.total,
      skip,
      take,
    };
  }

  /**
   * Get admin statistics (SUPER_ADMIN only)
   */
  @Get("stats")
  @RequirePermissions(Permission.SUPER_ADMIN_READ_SYSTEM_STATS)
  async getStats(@Req() request: Request & { user: any }) {
    return this.adminService.getStats();
  }

  /**
   * Get admin by ID
   */
  @Get(":id")
  @RequirePermissions(Permission.ADMIN_READ_ADMIN_ANY)
  async findOne(
    @Param("id", ParseUUIDPipe) id: string,
    @Req() request: Request & { user: any },
  ) {
    const admin = await this.adminService.findById(id);

    return admin.toResponseDto();
  }

  /**
   * Update admin user
   */
  @Patch(":id")
  @RequirePermissions(Permission.ADMIN_UPDATE_ADMIN)
  async update(
    @Param("id", ParseUUIDPipe) id: string,
    @Body() updateAdminDto: UpdateAdminDto,
    @Req() request: Request & { user: any },
  ) {
    const updatedAdmin = await this.adminService.update(
      id,
      updateAdminDto,
      request.user,
    );

    // Audit log
    await this.auditService.logFromRequest(
      request,
      "ADMIN_UPDATED",
      "ADMIN",
      id,
      { changes: updateAdminDto },
    );

    return updatedAdmin.toResponseDto();
  }

  /**
   * Delete admin user (SUPER_ADMIN only, soft delete)
   */
  @Delete(":id")
  @RequirePermissions(Permission.SUPER_ADMIN_DELETE_ADMIN)
  async remove(
    @Param("id", ParseUUIDPipe) id: string,
    @Req() request: Request & { user: any },
  ) {
    await this.adminService.remove(id, request.user);

    // Audit log
    await this.auditService.logFromRequest(
      request,
      "ADMIN_DELETED",
      "ADMIN",
      id,
      { deletedBy: request.user.userId },
    );

    return { message: "Admin disabled successfully" };
  }

  /**
   * Reset admin password (SUPER_ADMIN only)
   */
  @Post(":id/reset-password")
  @RequirePermissions(Permission.SUPER_ADMIN_RESET_ADMIN_PASSWORD)
  async resetPassword(
    @Param("id", ParseUUIDPipe) id: string,
    @Req() request: Request & { user: any },
  ) {
    const result = await this.adminService.resetPassword(id);

    // Audit log
    await this.auditService.logFromRequest(
      request,
      "ADMIN_PASSWORD_RESET",
      "ADMIN",
      id,
      { newPassword: result.newPassword },
    );

    return {
      message: "Password reset successfully",
      newPassword: result.newPassword,
    };
  }

  /**
   * Change own password
   */
  @Patch("me/change-password")
  @RequirePermissions(Permission.ADMIN_UPDATE_ADMIN)
  async changeOwnPassword(
    @Req() request: Request & { user: any },
    @Body() body: { currentPassword: string; newPassword: string },
  ) {
    const admin = await this.adminService.findByEmail(request.user.email);

    // Verify current password
    const isCurrentPasswordValid = await this.passwordService.compare(
      body.currentPassword,
      admin.passwordHash,
    );

    if (!isCurrentPasswordValid) {
      throw new BadRequestException("Current password is incorrect");
    }

    // Validate new password
    const passwordValidation = this.passwordService.validatePassword(
      body.newPassword,
    );
    if (!passwordValidation.isValid) {
      throw new BadRequestException(passwordValidation.errors.join(", "));
    }

    // Update password
    const newPasswordHash = await this.passwordService.hash(body.newPassword);
    admin.passwordHash = newPasswordHash;
    admin.updatedAt = new Date();

    await this.adminService["adminRepository"].save(admin);

    // Audit log
    await this.auditService.logFromRequest(
      request,
      "ADMIN_PASSWORD_CHANGED",
      "ADMIN",
      admin.id,
      { email: admin.email },
    );

    return { message: "Password changed successfully" };
  }

  /**
   * Get current admin user info
   */
  @Get("me")
  @RequirePermissions(Permission.ADMIN_READ_ADMIN_ANY)
  async getMe(@Req() request: Request & { user: any }) {
    const admin = await this.adminService.findById(request.user.userId);
    return admin.toResponseDto();
  }

  /**
   * Get admin statistics overview
   */
  @Get("stats/overview")
  @RequirePermissions(Permission.SUPER_ADMIN_READ_SYSTEM_STATS)
  async getStatsOverview(@Req() request: Request & { user: any }) {
    return this.adminService.getStats();
  }

  /**
   * Get pending drivers (for admin approval)
   */
  @Get("pending-drivers")
  @RequirePermissions(Permission.ADMIN_READ_DRIVER_ANY)
  async getPendingDrivers(
    @Req() request: Request & { user: any },
    @Query() query: AdminDriverListQueryDto,
  ) {
    const { cityId, search, skip = 0, take = 20 } = query;

    // SUPER_ADMIN can see all, ADMIN can only see their city
    let filterCityId = cityId;
    if (request.user.role !== AdminRole.SUPER_ADMIN && !filterCityId) {
      filterCityId = request.user.cityId;
    }

    const result = await this.driverAdminApplicationService.listDrivers({
      cityId: filterCityId,
      registrationStatus: "PENDING_APPROVAL",
      search,
      skip,
      take,
    });

    return {
      drivers: result.drivers,
      total: result.total,
      skip,
      take,
    };
  }

  /**
   * Get driver statistics for admin dashboard
   */
  @Get("driver-stats")
  @RequirePermissions(Permission.ADMIN_READ_DRIVER_ANY)
  async getDriverStats(
    @Req() request: Request & { user: any },
    @Query("cityId") cityId?: string,
  ) {
    // SUPER_ADMIN can see all, ADMIN can only see their city
    let filterCityId = cityId;
    if (request.user.role !== AdminRole.SUPER_ADMIN && !filterCityId) {
      filterCityId = request.user.cityId;
    }

    return this.driverAdminApplicationService.getDriverStats(filterCityId);
  }
}
