import { Injectable, NotFoundException } from "@nestjs/common";
import { DriversService } from "../drivers/drivers.service";
import { AuditService, CreateAuditLogDto } from "../services/audit.service";
import { Driver } from "../drivers/entities/driver.entity";
import { DriverStatus } from "../drivers/enums/driver-status.enum";
import { DriverRegistrationStatus } from "../drivers/enums/driver-registration-status.enum";
import { AuthenticatedUser } from "../auth/auth.types";

@Injectable()
export class DriverAdminApplicationService {
  constructor(
    private readonly driversService: DriversService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Update driver status (enable/disable)
   */
  async updateDriverStatus(
    driverId: string,
    isActive: boolean,
    actor: AuthenticatedUser,
    reason?: string,
  ): Promise<Driver> {
    // Get current driver status for audit log
    const currentDriver = await this.driversService.findOne(driverId);
    const oldStatus = currentDriver.isActive;
    const newStatus = isActive;

    // Update driver status
    const updatedDriver = await this.driversService.setActive(
      driverId,
      newStatus,
    );

    // Audit log
    await this.auditService.log({
      userId: actor.userId || actor.driverId || "unknown",
      userEmail: actor.email,
      userRole: actor.role,
      action: newStatus ? "DRIVER_ENABLED" : "DRIVER_DISABLED",
      resourceType: "DRIVER",
      resourceId: driverId,
      changes: {
        before: { isActive: oldStatus },
        after: { isActive: newStatus },
        fields: ["isActive"],
      },
    });

    return updatedDriver;
  }

  /**
   * Enable driver
   */
  async enableDriver(
    driverId: string,
    actor: AuthenticatedUser,
  ): Promise<Driver> {
    // Get current driver status for audit log
    const currentDriver = await this.driversService.findOne(driverId);
    const oldStatus = currentDriver.isActive;

    if (oldStatus) {
      return currentDriver;
    }

    // Enable driver
    const updatedDriver = await this.driversService.setActive(driverId, true);

    // Audit log
    await this.auditService.log({
      userId: actor.userId || actor.driverId || "unknown",
      userEmail: actor.email,
      userRole: actor.role,
      action: "DRIVER_ENABLED",
      resourceType: "DRIVER",
      resourceId: driverId,
      changes: {
        before: { isActive: oldStatus },
        after: { isActive: true },
        fields: ["isActive"],
      },
    });

    return updatedDriver;
  }

  /**
   * Disable driver
   */
  async disableDriver(
    driverId: string,
    actor: AuthenticatedUser,
    reason?: string,
  ): Promise<Driver> {
    // Get current driver status for audit log
    const currentDriver = await this.driversService.findOne(driverId);
    const oldStatus = currentDriver.isActive;

    if (!oldStatus) {
      return currentDriver;
    }

    // Disable driver
    const updatedDriver = await this.driversService.setActive(driverId, false);

    // Audit log
    await this.auditService.log({
      userId: actor.userId || actor.driverId || "unknown",
      userEmail: actor.email,
      userRole: actor.role,
      action: "DRIVER_DISABLED",
      resourceType: "DRIVER",
      resourceId: driverId,
      changes: {
        before: { isActive: oldStatus },
        after: { isActive: false },
        fields: ["isActive"],
      },
    });

    return updatedDriver;
  }

  /**
   * Bulk update driver status
   */
  async bulkUpdateDriverStatus(
    driverIds: string[],
    isActive: boolean,
    actor: AuthenticatedUser,
    reason?: string,
  ): Promise<{
    results: Array<{
      driverId: string;
      status: "success" | "skipped" | "error";
      driver?: Driver;
      message?: string;
    }>;
    errors: Array<{
      driverId: string;
      status: "error";
      message: string;
    }>;
    summary: {
      total: number;
      success: number;
      skipped: number;
      errors: number;
    };
  }> {
    // FIX: Define types for these arrays so TS doesn't infer "never[]"
    const results: Array<{
      driverId: string;
      status: "success" | "skipped" | "error";
      driver?: Driver;
      message?: string;
    }> = [];

    const errors: Array<{
      driverId: string;
      status: "error";
      message: string;
    }> = [];

    for (const driverId of driverIds) {
      try {
        // Get current driver status for audit log
        const currentDriver = await this.driversService.findOne(driverId);
        const oldStatus = currentDriver.isActive;

        if (oldStatus === isActive) {
          results.push({
            driverId,
            status: "skipped" as const,
            message: `Driver already ${isActive ? "enabled" : "disabled"}`,
          });
          continue;
        }

        // STAGE 3: City Isolation Check for Bulk Operations
        // Check if actor has permission to modify this driver
        if (
          actor.role !== "SUPER_ADMIN" &&
          actor.cityId !== currentDriver.cityId
        ) {
          errors.push({
            driverId,
            status: "error" as const,
            message: `You do not have permission to manage drivers outside your city. Driver is in ${currentDriver.cityId}, you are in ${actor.cityId}`,
          });
          continue;
        }

        // Update driver status with city isolation
        const updatedDriver =
          await this.driversService.setActiveWithCityIsolation(
            driverId,
            isActive,
            { role: actor.role, cityId: actor.cityId },
          );

        // Audit log
        await this.auditService.log({
          userId: actor.userId || actor.driverId || "unknown",
          userEmail: actor.email,
          userRole: actor.role,
          action: isActive ? "DRIVER_ENABLED" : "DRIVER_DISABLED",
          resourceType: "DRIVER",
          resourceId: driverId,
          changes: {
            before: { isActive: oldStatus },
            after: { isActive },
            fields: ["isActive"],
          },
        });

        results.push({
          driverId,
          status: "success" as const,
          driver: updatedDriver,
        });
      } catch (error: any) {
        // FIX: Use 'any' or check type for the catch variable
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        errors.push({
          driverId,
          status: "error" as const,
          message: errorMessage,
        });
      }
    }

    return {
      results,
      errors,
      summary: {
        total: driverIds.length,
        success: results.filter((r) => r.status === "success").length,
        skipped: results.filter((r) => r.status === "skipped").length,
        errors: errors.length,
      },
    };
  }

  /**
   * Get driver status change history
   */
  async getDriverStatusHistory(
    driverId: string,
    skip = 0,
    take = 50,
  ): Promise<{ logs: any[]; total: number }> {
    return this.auditService.findByResource("DRIVER", driverId, skip, take);
  }

  /**
   * Get driver by ID
   */
  async getDriver(driverId: string): Promise<Driver> {
    return this.driversService.findOne(driverId);
  }

  /**
   * List drivers with filters
   */
  async listDrivers(options: {
    cityId?: string;
    zoneId?: string;
    status?: DriverStatus;
    registrationStatus?: string;
    isActive?: boolean;
    authProvider?: string;
    search?: string;
    skip?: number;
    take?: number;
  }): Promise<{ drivers: Driver[]; total: number }> {
    return this.driversService.findAllWithFilters(options);
  }

  /**
   * Get driver statistics for admin dashboard
   */
  async getDriverStats(cityId?: string): Promise<{
    total: number;
    active: number;
    pendingApproval: number;
    profileIncomplete: number;
    rejected: number;
    byCity: { cityId: string; count: number }[];
    byStatus: { status: string; count: number }[];
    byRegistrationStatus: { status: string; count: number }[];
  }> {
    // Get all drivers for counting
    const { drivers } = await this.driversService.findAllWithFilters({
      cityId,
      skip: 0,
      take: 10000, // Large limit to get all for stats
    });

    const total = drivers.length;
    const active = drivers.filter((d) => d.isActive).length;
    const pendingApproval = drivers.filter(
      (d) => d.registrationStatus === DriverRegistrationStatus.PENDING_APPROVAL,
    ).length;
    const profileIncomplete = drivers.filter(
      (d) =>
        d.registrationStatus === DriverRegistrationStatus.PROFILE_INCOMPLETE,
    ).length;
    const rejected = drivers.filter(
      (d) => d.registrationStatus === DriverRegistrationStatus.REJECTED,
    ).length;

    // Group by city
    const cityMap = new Map<string, number>();
    drivers.forEach((d) => {
      if (d.cityId) {
        cityMap.set(d.cityId, (cityMap.get(d.cityId) || 0) + 1);
      }
    });
    const byCity = Array.from(cityMap.entries()).map(([cityId, count]) => ({
      cityId,
      count,
    }));

    // Group by status
    const statusMap = new Map<string, number>();
    drivers.forEach((d) => {
      if (d.status) {
        statusMap.set(d.status, (statusMap.get(d.status) || 0) + 1);
      }
    });
    const byStatus = Array.from(statusMap.entries()).map(([status, count]) => ({
      status,
      count,
    }));

    // Group by registration status
    const regStatusMap = new Map<string, number>();
    drivers.forEach((d) => {
      if (d.registrationStatus) {
        regStatusMap.set(
          d.registrationStatus,
          (regStatusMap.get(d.registrationStatus) || 0) + 1,
        );
      }
    });
    const byRegistrationStatus = Array.from(regStatusMap.entries()).map(
      ([status, count]) => ({
        status,
        count,
      }),
    );

    return {
      total,
      active,
      pendingApproval,
      profileIncomplete,
      rejected,
      byCity,
      byStatus,
      byRegistrationStatus,
    };
  }
}
