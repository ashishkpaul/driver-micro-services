// src/controllers/audit.controller.ts
import {
  Controller,
  Get,
  Query,
  UseGuards,
  Req,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import { AuditService } from '../services/audit.service';
import { AdminScopeGuard } from '../auth/admin-scope.guard';
import { Request } from 'express';
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
@UseGuards(AdminScopeGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  /**
   * Get audit logs for the current admin user
   */
  @Get('my-logs')
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
      throw new Error('Authenticated admin userId is missing');
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
  async getByAction(
    @Req() request: Request & { user: AuthPayload },
    @Param('action') action: string,
    @Query('skip') skip = 0,
    @Query('take') take = 50,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('userId') userId?: string,
  ) {
    // Only SUPER_ADMIN can access this endpoint
    if (request.user.role !== 'SUPER_ADMIN') {
      throw new Error('Access denied: SUPER_ADMIN only');
    }

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
  async getByResource(
    @Req() request: Request & { user: AuthPayload },
    @Param('resourceType') resourceType: string,
    @Param('resourceId', ParseUUIDPipe) resourceId: string,
    @Query('skip') skip = 0,
    @Query('take') take = 50,
  ) {
    // Only SUPER_ADMIN can access this endpoint
    if (request.user.role !== 'SUPER_ADMIN') {
      throw new Error('Access denied: SUPER_ADMIN only');
    }

    return this.auditService.findByResource(resourceType, resourceId, skip, take);
  }

  /**
   * Get audit logs by date range (SUPER_ADMIN only)
   */
  @Get('by-date-range')
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
    // Only SUPER_ADMIN can access this endpoint
    if (request.user.role !== 'SUPER_ADMIN') {
      throw new Error('Access denied: SUPER_ADMIN only');
    }

    if (!startDate || !endDate) {
      throw new Error('startDate and endDate are required');
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
  async getStats(@Req() request: Request & { user: AuthPayload }) {
    // Only SUPER_ADMIN can access this endpoint
    if (request.user.role !== 'SUPER_ADMIN') {
      throw new Error('Access denied: SUPER_ADMIN only');
    }

    return this.auditService.getStats();
  }

  /**
   * Clean up old audit logs (SUPER_ADMIN only)
   */
  @Get('cleanup')
  async cleanupOldLogs(
    @Req() request: Request & { user: AuthPayload },
    @Query('retentionDays') retentionDays = 90,
  ) {
    // Only SUPER_ADMIN can access this endpoint
    if (request.user.role !== 'SUPER_ADMIN') {
      throw new Error('Access denied: SUPER_ADMIN only');
    }

    const deletedCount = await this.auditService.cleanupOldLogs(retentionDays);
    
    return {
      message: `Cleaned up ${deletedCount} old audit logs`,
      deletedCount,
      retentionDays,
    };
  }
}