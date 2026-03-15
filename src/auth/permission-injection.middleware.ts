import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { RolePermissions } from './permissions';

interface AuthenticatedRequest extends Request {
  user: {
    driverId?: string;
    userId?: string;
    email?: string;
    role?: string;
    cityId?: string;
    sub?: string;
    type?: string;
    permissions?: string[];
    isActive?: boolean;
    status?: string;
    zoneId?: string;
  };
}

@Injectable()
export class PermissionInjectionMiddleware implements NestMiddleware {
  use(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    // Only process requests that have been authenticated
    if (req.user) {
      try {
        // Enhance user object with permissions and context
        const enhancedUser = this.enhanceUserWithPermissions(req.user, req);
        req.user = enhancedUser;
      } catch (error) {
        // If permission enhancement fails, continue with basic user info
        // This ensures the request doesn't fail due to permission issues
        console.warn('Permission injection failed:', error.message);
      }
    }
    
    next();
  }

  private enhanceUserWithPermissions(user: any, req: Request): any {
    // If user already has permissions, return as is
    if (user.permissions && user.permissions.length > 0) {
      return user;
    }

    const enhancedUser = { ...user };

    if (user.driverId) {
      // Driver token already carries user context in JWT claims
      enhancedUser.permissions = RolePermissions.DRIVER;
    } else if (user.userId && user.role) {
      // Admin token already carries city/active/role claims
      enhancedUser.permissions =
        RolePermissions[user.role as keyof typeof RolePermissions] || [];
    } else if (user.role === 'SYSTEM' || user.type === 'system') {
      enhancedUser.permissions = RolePermissions.SYSTEM;
    } else {
      enhancedUser.permissions = [];
    }

    // Add dynamic context for resource-level permissions
    this.addDynamicContext(enhancedUser, req);

    return enhancedUser;
  }

  private addDynamicContext(user: any, req: Request): void {
    // Extract resource context from request for dynamic permission evaluation
    const params = req.params || {};
    const body = req.body || {};
    const query = req.query || {};

    // Extract resource IDs from various sources
    user.resourceCityId = params.cityId || body.cityId || query.cityId;
    user.resourceZoneId = params.zoneId || body.zoneId || query.zoneId;
    user.resourceDriverId = params.driverId || body.driverId || query.driverId;
    user.resourceDeliveryId = params.deliveryId || body.deliveryId || query.deliveryId;
    
    // Add requested action for context-aware permissions
    user.requestedAction = req.method;
    user.requestedPath = req.path;
    
    // Add request metadata
    user.requestIp = req.ip || req.connection?.remoteAddress;
    user.userAgent = req.get('User-Agent');
  }
}