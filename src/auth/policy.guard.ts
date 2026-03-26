// src/auth/policy.guard.ts
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  ForbiddenException,
  Logger,
  Optional,
} from "@nestjs/common";
import { ModuleRef, Reflector } from "@nestjs/core";
import { Request } from "express";
import { PermissionType } from "./permissions";
import { SetMetadata } from "@nestjs/common";
import { AuthorizationService } from "../authorization/authorization.service";
import { AuthorizationAuditService } from "./authorization-audit.service";

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
    private readonly moduleRef: ModuleRef,
    @Optional() private readonly authorizationService?: AuthorizationService,
    @Optional()
    private readonly authorizationAuditService?: AuthorizationAuditService,
  ) {}

  private getAuthorizationService(): AuthorizationService {
    return (
      this.authorizationService ||
      this.moduleRef.get(AuthorizationService, { strict: false })
    );
  }

  private getAuthorizationAuditService(): AuthorizationAuditService {
    return (
      this.authorizationAuditService ||
      this.moduleRef.get(AuthorizationAuditService, { strict: false })
    );
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<
      PermissionType[]
    >("permissions", [context.getHandler(), context.getClass()]);

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true; // No permissions required
    }

    const request = context.switchToHttp().getRequest<Request>();
    const policyContext = this.buildPolicyContext(request);
    const authorizationService = this.getAuthorizationService();
    const authorizationAuditService = this.getAuthorizationAuditService();

    const decisions = await Promise.all(
      requiredPermissions.map((permission) =>
        authorizationService.authorize(
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

    const hasPermission = decisions.some((decision) => decision.allowed);

    if (!hasPermission) {
      this.logger.warn(
        `Access denied: ${policyContext.role} (${policyContext.userId || policyContext.driverId}) ` +
          `attempted ${request.method} ${request.path} without ${requiredPermissions.join(" or ")}`,
      );

      await authorizationAuditService.logAuthorization(request, {
        timestamp: new Date(),
        actorId: policyContext.userId || policyContext.driverId || "unknown",
        actorRole: policyContext.role || "unknown",
        action: request.method,
        resource: request.path,
        resourceId:
          policyContext.resourceDeliveryId ||
          policyContext.resourceDriverId ||
          policyContext.resourceCityId ||
          "unknown",
        decision: "DENY",
        reason:
          decisions.find((d) => !d.allowed)?.reason ||
          "INSUFFICIENT_PERMISSIONS",
        context: {
          requiredPermissions,
          cityId: policyContext.cityId,
          zoneId: policyContext.zoneId,
        },
      });

      throw new ForbiddenException("Insufficient permissions");
    }

    await authorizationAuditService.logAuthorization(request, {
      timestamp: new Date(),
      actorId: policyContext.userId || policyContext.driverId || "unknown",
      actorRole: policyContext.role || "unknown",
      action: request.method,
      resource: request.path,
      resourceId:
        policyContext.resourceDeliveryId ||
        policyContext.resourceDriverId ||
        policyContext.resourceCityId ||
        "unknown",
      decision: "ALLOW",
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
    const params = request.params;
    const path = request.route?.path || '';

    // 1. Identify what the generic :id represents based on the route
    let inferredDriverId: string | undefined;
    let inferredDeliveryId: string | undefined;

    if (params.id) {
      if (path.includes('/drivers')) {
        inferredDriverId = params.id;
      } else if (path.includes('/deliveries')) {
        inferredDeliveryId = params.id;
      }
    }

    return {
      userId: user?.userId || user?.sub, // Support both naming conventions
      driverId: user?.driverId,
      role: user?.role || user?.type,
      cityId: user?.cityId,
      zoneId: user?.zoneId,
      permissions: user?.permissions || [],
      isActive: user?.isActive !== false,
      
      // Resource Mapping with correct precedence: 
      // Specific param > Inferred generic :id > Body > User Context
      resourceCityId:
        params.cityId ||
        request.body.cityId ||
        request.query?.cityId ||
        user?.resourceCityId,

      resourceZoneId:
        params.zoneId ||
        request.body.zoneId ||
        request.query?.zoneId ||
        user?.resourceZoneId,

      resourceDriverId:
        params.driverId ||
        inferredDriverId || // Fixed: Now catches :id in /drivers routes
        request.body.driverId ||
        request.query?.driverId ||
        user?.resourceDriverId,

      resourceDeliveryId:
        params.deliveryId ||
        inferredDeliveryId || // Fixed: No longer blindly grabs :id for non-delivery routes
        request.body.deliveryId ||
        request.query?.deliveryId ||
        user?.resourceDeliveryId,
    };
  }
}

// Decorator for applying permissions
export const RequirePermissions = (...permissions: PermissionType[]) =>
  SetMetadata("permissions", permissions);
