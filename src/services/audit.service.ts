// src/services/audit.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../entities/audit-log.entity';
import { Request } from 'express';

export interface CreateAuditLogDto {
  userId: string;
  userEmail?: string;
  userRole?: string;
  action: string;
  resourceType: string;
  resourceId: string;
  changes?: {
    before?: any;
    after?: any;
    fields?: string[];
  };
  ipAddress?: string;
  userAgent?: string;
  requestId?: string;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private auditRepository: Repository<AuditLog>,
  ) {}

  /**
   * Log an audit event
   */
  async log(data: CreateAuditLogDto): Promise<AuditLog> {
    const auditLog = this.auditRepository.create({
      userId: data.userId,
      userEmail: data.userEmail,
      userRole: data.userRole,
      action: data.action,
      resourceType: data.resourceType,
      resourceId: data.resourceId,
      changes: data.changes,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      requestId: data.requestId,
    });

    return this.auditRepository.save(auditLog);
  }

  /**
   * Get audit logs for a specific user
   */
  async findByUser(
    userId: string,
    skip = 0,
    take = 50,
    filters?: {
      action?: string;
      resourceType?: string;
      startDate?: Date;
      endDate?: Date;
    },
  ): Promise<{ logs: AuditLog[]; total: number }> {
    const query = this.auditRepository.createQueryBuilder('audit')
      .where('audit.userId = :userId', { userId })
      .orderBy('audit.createdAt', 'DESC')
      .skip(skip)
      .take(take);

    if (filters?.action) {
      query.andWhere('audit.action = :action', { action: filters.action });
    }

    if (filters?.resourceType) {
      query.andWhere('audit.resourceType = :resourceType', { resourceType: filters.resourceType });
    }

    if (filters?.startDate) {
      query.andWhere('audit.createdAt >= :startDate', { startDate: filters.startDate });
    }

    if (filters?.endDate) {
      query.andWhere('audit.createdAt <= :endDate', { endDate: filters.endDate });
    }

    const [logs, total] = await query.getManyAndCount();

    return { logs, total };
  }

  /**
   * Get audit logs for a specific resource
   */
  async findByResource(
    resourceType: string,
    resourceId: string,
    skip = 0,
    take = 50,
  ): Promise<{ logs: AuditLog[]; total: number }> {
    const query = this.auditRepository.createQueryBuilder('audit')
      .where('audit.resourceType = :resourceType', { resourceType })
      .andWhere('audit.resourceId = :resourceId', { resourceId })
      .orderBy('audit.createdAt', 'DESC')
      .skip(skip)
      .take(take);

    const [logs, total] = await query.getManyAndCount();

    return { logs, total };
  }

  /**
   * Get audit logs by action
   */
  async findByAction(
    action: string,
    skip = 0,
    take = 50,
    filters?: {
      startDate?: Date;
      endDate?: Date;
      userId?: string;
    },
  ): Promise<{ logs: AuditLog[]; total: number }> {
    const query = this.auditRepository.createQueryBuilder('audit')
      .where('audit.action = :action', { action })
      .orderBy('audit.createdAt', 'DESC')
      .skip(skip)
      .take(take);

    if (filters?.startDate) {
      query.andWhere('audit.createdAt >= :startDate', { startDate: filters.startDate });
    }

    if (filters?.endDate) {
      query.andWhere('audit.createdAt <= :endDate', { endDate: filters.endDate });
    }

    if (filters?.userId) {
      query.andWhere('audit.userId = :userId', { userId: filters.userId });
    }

    const [logs, total] = await query.getManyAndCount();

    return { logs, total };
  }

  /**
   * Get audit logs by date range
   */
  async findByDateRange(
    startDate: Date,
    endDate: Date,
    skip = 0,
    take = 50,
    filters?: {
      action?: string;
      resourceType?: string;
      userId?: string;
    },
  ): Promise<{ logs: AuditLog[]; total: number }> {
    const query = this.auditRepository.createQueryBuilder('audit')
      .where('audit.createdAt >= :startDate', { startDate })
      .andWhere('audit.createdAt <= :endDate', { endDate })
      .orderBy('audit.createdAt', 'DESC')
      .skip(skip)
      .take(take);

    if (filters?.action) {
      query.andWhere('audit.action = :action', { action: filters.action });
    }

    if (filters?.resourceType) {
      query.andWhere('audit.resourceType = :resourceType', { resourceType: filters.resourceType });
    }

    if (filters?.userId) {
      query.andWhere('audit.userId = :userId', { userId: filters.userId });
    }

    const [logs, total] = await query.getManyAndCount();

    return { logs, total };
  }

  /**
   * Get audit statistics
   */
  async getStats(): Promise<{
    total: number;
    byAction: { action: string; count: number }[];
    byResourceType: { resourceType: string; count: number }[];
    byUser: { userId: string; count: number }[];
    recentActivity: AuditLog[];
  }> {
    const total = await this.auditRepository.count();

    // Count by action
    const byAction = await this.auditRepository
      .createQueryBuilder('audit')
      .select('audit.action', 'action')
      .addSelect('COUNT(*)', 'count')
      .groupBy('audit.action')
      .orderBy('count', 'DESC')
      .getRawMany();

    // Count by resource type
    const byResourceType = await this.auditRepository
      .createQueryBuilder('audit')
      .select('audit.resourceType', 'resourceType')
      .addSelect('COUNT(*)', 'count')
      .groupBy('audit.resourceType')
      .orderBy('count', 'DESC')
      .getRawMany();

    // Count by user
    const byUser = await this.auditRepository
      .createQueryBuilder('audit')
      .select('audit.userId', 'userId')
      .addSelect('COUNT(*)', 'count')
      .groupBy('audit.userId')
      .orderBy('count', 'DESC')
      .limit(10)
      .getRawMany();

    // Recent activity
    const recentActivity = await this.auditRepository
      .createQueryBuilder('audit')
      .orderBy('audit.createdAt', 'DESC')
      .limit(20)
      .getMany();

    return {
      total,
      byAction: byAction.map(a => ({ action: a.action, count: parseInt(a.count) })),
      byResourceType: byResourceType.map(r => ({ resourceType: r.resourceType, count: parseInt(r.count) })),
      byUser: byUser.map(u => ({ userId: u.userId, count: parseInt(u.count) })),
      recentActivity,
    };
  }

  /**
   * Clean up old audit logs (for maintenance)
   */
  async cleanupOldLogs(retentionDays: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

    const result = await this.auditRepository
      .createQueryBuilder()
      .delete()
      .from(AuditLog)
      .where('createdAt < :cutoffDate', { cutoffDate })
      .execute();

    return result.affected || 0;
  }

  /**
   * Create audit log from request context
   */
  async logFromRequest(
    request: Request,
    action: string,
    resourceType: string,
    resourceId: string,
    changes?: any,
  ): Promise<void> {
    try {
      const user = (request as any).user;
      const auditData: CreateAuditLogDto = {
        userId: user?.userId || user?.driverId || 'anonymous',
        userEmail: user?.email,
        userRole: user?.role,
        action,
        resourceType,
        resourceId,
        changes,
        ipAddress: this.getClientIp(request),
        userAgent: request.headers['user-agent'],
        requestId: request.headers['x-request-id'] as string,
      };

      await this.log(auditData);
    } catch (error) {
      // Don't throw errors for audit logging failures
      console.error('Failed to create audit log:', error);
    }
  }

  /**
   * Get client IP address from request
   */
  private getClientIp(request: Request): string | undefined {
    return (
      request.headers['x-forwarded-for'] as string ||
      request.headers['x-real-ip'] as string ||
      request.connection.remoteAddress ||
      request.ip
    );
  }
}