// src/controllers/driver-status.controller.ts
import {
  Controller,
  Patch,
  Param,
  Body,
  UseGuards,
  Req,
  ParseUUIDPipe,
} from '@nestjs/common';
import { DriversService } from '../drivers/drivers.service';
import { AdminScopeGuard } from '../auth/admin-scope.guard';
import { AuditService } from '../services/audit.service';
import { Request } from 'express';
import { AdminUpdateDriverStatusDto, AdminBulkUpdateDriverStatusDto } from '../dto/admin-driver-status.dto';

// Define AuthPayload interface locally since it's not exported from auth.service
interface AuthPayload {
  userId?: string;
  driverId?: string;
  email?: string;
  role?: string;
  cityId?: string;
  sub?: string;
  type?: string;
}

@Controller('admin/drivers')
@UseGuards(AdminScopeGuard)
export class DriverStatusController {
  constructor(
    private readonly driversService: DriversService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Toggle driver status (enable/disable)
   * Only ADMIN and SUPER_ADMIN can access this endpoint
   */
  @Patch(':id/status')
  async updateDriverStatus(
    @Param('id', ParseUUIDPipe) driverId: string,
    @Body() updateDriverStatusDto: AdminUpdateDriverStatusDto,
    @Req() request: Request & { user: AuthPayload },
  ) {
    const adminUser = request.user;
    
    // Get current driver status for audit log
    const currentDriver = await this.driversService.findOne(driverId);
    const oldStatus = currentDriver.isActive;
    const newStatus = updateDriverStatusDto.isActive;

    // Update driver status
    const updatedDriver = await this.driversService.setActive(
      driverId,
      newStatus,
    );

    // Audit log
    await this.auditService.logFromRequest(
      request,
      'DRIVER_STATUS_CHANGED',
      'DRIVER',
      driverId,
      {
        oldStatus,
        newStatus,
        changedBy: adminUser.userId || adminUser.driverId,
        reason: updateDriverStatusDto.reason,
      },
    );

    return {
      message: `Driver ${newStatus ? 'enabled' : 'disabled'} successfully`,
      driver: updatedDriver,
    };
  }

  /**
   * Enable driver
   */
  @Patch(':id/enable')
  async enableDriver(
    @Param('id', ParseUUIDPipe) driverId: string,
    @Req() request: Request & { user: AuthPayload },
  ) {
    const adminUser = request.user;
    
    // Get current driver status for audit log
    const currentDriver = await this.driversService.findOne(driverId);
    const oldStatus = currentDriver.isActive;

    if (oldStatus) {
      return {
        message: 'Driver is already enabled',
        driver: currentDriver,
      };
    }

    // Enable driver
    const updatedDriver = await this.driversService.setActive(
      driverId,
      true,
    );

    // Audit log
    await this.auditService.logFromRequest(
      request,
      'DRIVER_ENABLED',
      'DRIVER',
      driverId,
      {
        oldStatus,
        newStatus: true,
        changedBy: adminUser.userId || adminUser.driverId,
      },
    );

    return {
      message: 'Driver enabled successfully',
      driver: updatedDriver,
    };
  }

  /**
   * Disable driver
   */
  @Patch(':id/disable')
  async disableDriver(
    @Param('id', ParseUUIDPipe) driverId: string,
    @Body() body: { reason?: string },
    @Req() request: Request & { user: AuthPayload },
  ) {
    const adminUser = request.user;
    
    // Get current driver status for audit log
    const currentDriver = await this.driversService.findOne(driverId);
    const oldStatus = currentDriver.isActive;

    if (!oldStatus) {
      return {
        message: 'Driver is already disabled',
        driver: currentDriver,
      };
    }

    // Disable driver
    const updatedDriver = await this.driversService.setActive(
      driverId,
      false,
    );

    // Audit log
    await this.auditService.logFromRequest(
      request,
      'DRIVER_DISABLED',
      'DRIVER',
      driverId,
      {
        oldStatus,
        newStatus: false,
        changedBy: adminUser.userId || adminUser.driverId,
        reason: body.reason,
      },
    );

    return {
      message: 'Driver disabled successfully',
      driver: updatedDriver,
    };
  }

  /**
   * Bulk update driver status
   */
  @Patch('bulk/status')
  async bulkUpdateDriverStatus(
    @Body() body: AdminBulkUpdateDriverStatusDto,
    @Req() request: Request & { user: AuthPayload },
  ) {
    const adminUser = request.user;
    const { driverIds, isActive, reason } = body;

    const results = [];
    const errors = [];

    for (const driverId of driverIds) {
      try {
        // Get current driver status for audit log
        const currentDriver = await this.driversService.findOne(driverId);
        const oldStatus = currentDriver.isActive;

        if (oldStatus === isActive) {
          results.push({
            driverId,
            status: 'skipped',
            message: `Driver already ${isActive ? 'enabled' : 'disabled'}`,
          });
          continue;
        }

        // Update driver status
        const updatedDriver = await this.driversService.setActive(
          driverId,
          isActive,
        );

        // Audit log
        await this.auditService.logFromRequest(
          request,
          isActive ? 'DRIVER_ENABLED' : 'DRIVER_DISABLED',
          'DRIVER',
          driverId,
          {
            oldStatus,
            newStatus: isActive,
            changedBy: adminUser.userId || adminUser.driverId,
            reason,
          },
        );

        results.push({
          driverId,
          status: 'success',
          driver: updatedDriver,
        });
      } catch (error) {
        errors.push({
          driverId,
          status: 'error',
          message: error.message,
        });
      }
    }

    return {
      message: `Bulk ${isActive ? 'enable' : 'disable'} completed`,
      results,
      errors,
      summary: {
        total: driverIds.length,
        success: results.filter(r => r.status === 'success').length,
        skipped: results.filter(r => r.status === 'skipped').length,
        errors: errors.length,
      },
    };
  }
}