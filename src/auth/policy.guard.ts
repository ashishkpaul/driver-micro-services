// src/auth/policy.guard.ts
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { PermissionType } from './permissions';
import { SetMetadata } from '@nestjs/common';
import { AuthorizationService } from '../authorization/authorization.service';
import { AuthorizationAuditService } from './authorization-audit.service';

interface PolicyContext {
  userId?: string;
  driverId?: string;
  role: string;
  cityId?: string;
  zoneId?: string;
  permissions: PermissionType[];
  isActive: boolean;
  // Dynamic context from request
  resourceCityId?: string;
  resourceZoneId?: string;
  resourceDriverId?: string;
  resourceDeliveryId?: string;
  requestedAction?: string;
}

@Injectable()
export class PolicyGuard implements CanActivate {
  private readonly logger = new Logger(PolicyGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly authorizationService: AuthorizationService,
    private readonly authorizationAuditService: AuthorizationAuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<PermissionType[]>(
      'permissions',
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true; // No permissions required
    }

    const request = context.switchToHttp().getRequest<Request>();
    const policyContext = this.buildPolicyContext(request);

    const decisions = await Promise.all(
      requiredPermissions.map(permission =>
        this.authorizationService.authorize(
          {
            userId: policyContext.userId,
            driverId: policyContext.driverId,
            role: policyContext.role,
            permissions: policyContext.permissions,
            cityId: policyContext.cityId,
            zoneId: policyContext.zoneId,
            isActive: policyContext.isActive,
          },
          permission,
          {
            deliveryId: policyContext.resourceDeliveryId,
            driverId: policyContext.resourceDriverId,
            cityId: policyContext.resourceCityId,
            zoneId: policyContext.resourceZoneId,
            path: request.path,
            method: request.method,
            body: request.body,
          },
        ),
      ),
    );

    const hasPermission = decisions.some(decision => decision.allowed);

    if (!hasPermission) {
      this.logger.warn(
        `Access denied: ${policyContext.role} (${policyContext.userId || policyContext.driverId}) ` +
        `attempted ${request.method} ${request.path} without ${requiredPermissions.join(' or ')}`,
      );

      await this.authorizationAuditService.logAuthorization(request, {
        timestamp: new Date(),
        actorId: policyContext.userId || policyContext.driverId || 'unknown',
        actorRole: policyContext.role || 'unknown',
        action: request.method,
        resource: request.path,
        resourceId:
          policyContext.resourceDeliveryId ||
          policyContext.resourceDriverId ||
          policyContext.resourceCityId ||
          'unknown',
        decision: 'DENY',
        reason: decisions.find(d => !d.allowed)?.reason || 'INSUFFICIENT_PERMISSIONS',
        context: {
          requiredPermissions,
          cityId: policyContext.cityId,
          zoneId: policyContext.zoneId,
        },
      });

      throw new ForbiddenException('Insufficient permissions');
    }

    await this.authorizationAuditService.logAuthorization(request, {
      timestamp: new Date(),
      actorId: policyContext.userId || policyContext.driverId || 'unknown',
      actorRole: policyContext.role || 'unknown',
      action: request.method,
      resource: request.path,
      resourceId:
        policyContext.resourceDeliveryId ||
        policyContext.resourceDriverId ||
        policyContext.resourceCityId ||
        'unknown',
      decision: 'ALLOW',
      context: {
        requiredPermissions,
        cityId: policyContext.cityId,
        zoneId: policyContext.zoneId,
      },
    });

    return true;
  }

  private buildPolicyContext(request: Request): PolicyContext {
    const user = (request as any).user;
    
    return {
      userId: user?.userId,
      driverId: user?.driverId,
      role: user?.role || user?.type,
      cityId: user?.cityId,
      zoneId: user?.zoneId,
      permissions: user?.permissions || [],
      isActive: user?.isActive !== false,
      // Extract from request params/body for resource-level checks
      resourceCityId:
        request.params.cityId ||
        request.body.cityId ||
        request.query?.cityId ||
        user?.resourceCityId,
      resourceZoneId:
        request.params.zoneId ||
        request.body.zoneId ||
        request.query?.zoneId ||
        user?.resourceZoneId,
      resourceDriverId:
        request.params.driverId ||
        request.body.driverId ||
        request.query?.driverId ||
        user?.resourceDriverId,
      resourceDeliveryId:
        request.params.deliveryId ||
        request.params.id ||
        request.body.deliveryId ||
        request.query?.deliveryId ||
        user?.resourceDeliveryId,
    };
  }
}

// Decorator for applying permissions
export const RequirePermissions = (...permissions: PermissionType[]) => 
  SetMetadata('permissions', permissions);
