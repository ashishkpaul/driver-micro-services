// src/controllers/driver-status.controller.ts
import {
  Controller,
  Patch,
  Param,
  Body,
  Get,
  Query,
  UseGuards,
  Req,
  ParseUUIDPipe,
  BadRequestException,
  VERSION_NEUTRAL,
} from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { Request } from "express";
import {
  AdminUpdateDriverStatusDto,
  AdminBulkUpdateDriverStatusDto,
  AdminDriverListQueryDto,
} from "../dto/admin-driver-status.dto";
import { RequirePermissions, PolicyGuard } from "../auth/policy.guard";
import { Permission } from "../auth/permissions";
import { DriverAdminApplicationService } from "../application/driver-admin.application";
import { AuthenticatedUser } from "../auth/auth.types";
import { DriverRegistrationService } from "../drivers/driver-registration.service";

@Controller({ path: "admin/drivers", version: VERSION_NEUTRAL })
@UseGuards(AuthGuard("jwt"), PolicyGuard)
export class DriverStatusController {
  constructor(
    private readonly driverAdminAppService: DriverAdminApplicationService,
    private readonly driverRegistrationService: DriverRegistrationService,
  ) {}

  /**
   * List drivers with filters (admin only)
   */
  @Get()
  @RequirePermissions(Permission.ADMIN_READ_DRIVER_ANY)
  async listDrivers(
    @Req() request: Request & { user: AuthenticatedUser },
    @Query() query: AdminDriverListQueryDto,
  ) {
    const {
      cityId,
      zoneId,
      status,
      isActive,
      authProvider,
      search,
      skip = 0,
      take = 50,
    } = query;

    // Enforce city scope for ADMIN users (SUPER_ADMIN can query any city)
    let scopedCityId = cityId;
    if (request.user.role === "ADMIN" && !scopedCityId) {
      scopedCityId = request.user.cityId;
    }

    const result = await this.driverAdminAppService.listDrivers({
      cityId: scopedCityId,
      zoneId,
      status,
      isActive,
      authProvider,
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
   * Toggle driver status (enable/disable)
   * Only ADMIN and SUPER_ADMIN can access this endpoint
   */
  @Patch(":id/status")
  @RequirePermissions(Permission.ADMIN_UPDATE_DRIVER_STATUS)
  async updateDriverStatus(
    @Param("id", ParseUUIDPipe) driverId: string,
    @Body() updateDriverStatusDto: AdminUpdateDriverStatusDto,
    @Req() request: Request & { user: AuthenticatedUser },
  ) {
    const adminUser = request.user;

    const updatedDriver = await this.driverAdminAppService.updateDriverStatus(
      driverId,
      updateDriverStatusDto.isActive,
      adminUser,
      updateDriverStatusDto.reason,
    );

    return {
      message: `Driver ${updateDriverStatusDto.isActive ? "enabled" : "disabled"} successfully`,
      driver: updatedDriver,
    };
  }

  /**
   * Enable driver
   */
  @Patch(":id/enable")
  @RequirePermissions(Permission.ADMIN_UPDATE_DRIVER_STATUS)
  async enableDriver(
    @Param("id", ParseUUIDPipe) driverId: string,
    @Req() request: Request & { user: AuthenticatedUser },
  ) {
    const adminUser = request.user;

    const updatedDriver = await this.driverAdminAppService.enableDriver(
      driverId,
      adminUser,
    );

    return {
      message: "Driver enabled successfully",
      driver: updatedDriver,
    };
  }

  /**
   * Disable driver
   */
  @Patch(":id/disable")
  @RequirePermissions(Permission.ADMIN_UPDATE_DRIVER_STATUS)
  async disableDriver(
    @Param("id", ParseUUIDPipe) driverId: string,
    @Body() body: { reason?: string },
    @Req() request: Request & { user: AuthenticatedUser },
  ) {
    const adminUser = request.user;

    const updatedDriver = await this.driverAdminAppService.disableDriver(
      driverId,
      adminUser,
      body.reason,
    );

    return {
      message: "Driver disabled successfully",
      driver: updatedDriver,
    };
  }

  /**
   * Bulk update driver status
   */
  @Patch("bulk/status")
  @RequirePermissions(Permission.ADMIN_UPDATE_DRIVER_STATUS)
  async bulkUpdateDriverStatus(
    @Body() body: AdminBulkUpdateDriverStatusDto,
    @Req() request: Request & { user: AuthenticatedUser },
  ) {
    const adminUser = request.user;
    const { driverIds, isActive, reason } = body;

    const result = await this.driverAdminAppService.bulkUpdateDriverStatus(
      driverIds,
      isActive,
      adminUser,
      reason,
    );

    return {
      message: `Bulk ${isActive ? "enable" : "disable"} completed`,
      ...result,
    };
  }

  /**
   * Approve driver registration
   */
  @Patch(":id/approve")
  @RequirePermissions(Permission.ADMIN_UPDATE_DRIVER_STATUS)
  async approveDriver(
    @Param("id", ParseUUIDPipe) driverId: string,
    @Req() request: Request & { user: AuthenticatedUser },
  ) {
    const adminUser = request.user;
    const adminId = adminUser.userId || adminUser.driverId || "system";

    const updatedDriver = await this.driverRegistrationService.approveDriver(
      driverId,
      adminId,
    );

    return {
      message: "Driver approved successfully",
      driver: updatedDriver,
    };
  }

  /**
   * Reject driver registration
   */
  @Patch(":id/reject")
  @RequirePermissions(Permission.ADMIN_UPDATE_DRIVER_STATUS)
  async rejectDriver(
    @Param("id", ParseUUIDPipe) driverId: string,
    @Body() body: { reason: string },
    @Req() request: Request & { user: AuthenticatedUser },
  ) {
    if (!body.reason) {
      throw new BadRequestException("Rejection reason is required");
    }

    const adminUser = request.user;
    const adminId = adminUser.userId || adminUser.driverId || "system";

    const updatedDriver = await this.driverRegistrationService.rejectDriver(
      driverId,
      adminId,
      body.reason,
    );

    return {
      message: "Driver rejected successfully",
      driver: updatedDriver,
    };
  }

  /**
   * List drivers pending approval
   */
  @Get("pending")
  @RequirePermissions(Permission.ADMIN_READ_DRIVER_ANY)
  async listPendingDrivers(
    @Req() request: Request & { user: AuthenticatedUser },
    @Query() query: AdminDriverListQueryDto,
  ) {
    const { cityId, zoneId, skip = 0, take = 50 } = query;

    // Enforce city scope for ADMIN users (SUPER_ADMIN can query any city)
    let scopedCityId = cityId;
    if (request.user.role === "ADMIN" && !scopedCityId) {
      scopedCityId = request.user.cityId;
    }

    const result = await this.driverAdminAppService.listDrivers({
      cityId: scopedCityId,
      zoneId,
      skip,
      take,
    });

    // Filter to only pending approval drivers
    const pendingDrivers = result.drivers.filter(
      (driver) => driver.registrationStatus === "PENDING_APPROVAL",
    );

    return {
      drivers: pendingDrivers,
      total: pendingDrivers.length,
      skip,
      take,
    };
  }
}
