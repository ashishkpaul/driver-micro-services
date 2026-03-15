// src/controllers/audit.controller.ts
import {
  Controller,
  Get,
  Query,
  UseGuards,
  Req,
  Param,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import { AuditService } from '../services/audit.service';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { PolicyGuard, RequirePermissions } from '../auth/policy.guard';
import { Permission } from '../auth/permissions';
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

@Controller('admin/audit-logs')
@UseGuards(AuthGuard('jwt'), PolicyGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  /**
   * Get audit logs for the current admin user
   */
  @Get('my-logs')
  @RequirePermissions(Permission.ADMIN_READ_AUDIT_OWN)
  async getMyLogs(
    @Req() request: Request & { user: AuthPayload },
    @Query('skip') skip = 0,
    @Query('take') take = 50,
    @Query('action') action?: string,
    @Query('resourceType') resourceType?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    const userId = request.user.userId;

    if (!userId) {
      throw new BadRequestException('Authenticated admin userId is missing');
    }
    
    const filters = {
      action,
      resourceType,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
    };

    return this.auditService.findByUser(userId, skip, take, filters);
  }

  /**
   * Get audit logs by action (SUPER_ADMIN only)
   */
  @Get('by-action/:action')
  @RequirePermissions(Permission.SUPER_ADMIN_READ_AUDIT_ANY)
  async getByAction(
    @Req() request: Request & { user: AuthPayload },
    @Param('action') action: string,
    @Query('skip') skip = 0,
    @Query('take') take = 50,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('userId') userId?: string,
  ) {
    const filters = {
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      userId,
    };

    return this.auditService.findByAction(action, skip, take, filters);
  }

  /**
   * Get audit logs by resource (SUPER_ADMIN only)
   */
  @Get('by-resource/:resourceType/:resourceId')
  @RequirePermissions(Permission.SUPER_ADMIN_READ_AUDIT_ANY)
  async getByResource(
    @Req() request: Request & { user: AuthPayload },
    @Param('resourceType') resourceType: string,
    @Param('resourceId', ParseUUIDPipe) resourceId: string,
    @Query('skip') skip = 0,
    @Query('take') take = 50,
  ) {
    return this.auditService.findByResource(resourceType, resourceId, skip, take);
  }

  /**
   * Get audit logs by date range (SUPER_ADMIN only)
   */
  @Get('by-date-range')
  @RequirePermissions(Permission.SUPER_ADMIN_READ_AUDIT_ANY)
  async getByDateRange(
    @Req() request: Request & { user: AuthPayload },
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Query('skip') skip = 0,
    @Query('take') take = 50,
    @Query('action') action?: string,
    @Query('resourceType') resourceType?: string,
    @Query('userId') userId?: string,
  ) {
    if (!startDate || !endDate) {
      throw new BadRequestException('startDate and endDate are required');
    }

    const filters = {
      action,
      resourceType,
      userId,
    };

    return this.auditService.findByDateRange(
      new Date(startDate as string),
      new Date(endDate as string),
      skip,
      take,
      filters,
    );
  }

  /**
   * Get audit statistics (SUPER_ADMIN only)
   */
  @Get('stats')
  @RequirePermissions(Permission.SUPER_ADMIN_READ_SYSTEM_STATS)
  async getStats(@Req() request: Request & { user: AuthPayload }) {
    return this.auditService.getStats();
  }

  /**
   * Clean up old audit logs (SUPER_ADMIN only)
   */
  @Get('cleanup')
  @RequirePermissions(Permission.SUPER_ADMIN_READ_SYSTEM_STATS)
  async cleanupOldLogs(
    @Req() request: Request & { user: AuthPayload },
    @Query('retentionDays') retentionDays = 90,
  ) {
    const deletedCount = await this.auditService.cleanupOldLogs(retentionDays);
    
    return {
      message: `Cleaned up ${deletedCount} old audit logs`,
      deletedCount,
      retentionDays,
    };
  }
}