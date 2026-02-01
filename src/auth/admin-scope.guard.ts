// src/auth/admin-scope.guard.ts
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Role } from './roles.enum';

interface AdminJwtPayload {
  userId: string;
  email: string;
  role: Role;
  cityId?: string;
  sub: string;
  type: 'admin';
}

interface DriverJwtPayload {
  driverId: string;
  sub: string;
  type: 'driver';
}

export class AdminScopeGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const user = req.user as AdminJwtPayload | DriverJwtPayload | undefined;

    if (!user) {
      throw new UnauthorizedException('Missing authentication');
    }

    // Check if user is admin (not driver)
    if (user.type !== 'admin') {
      throw new ForbiddenException('Admin access required');
    }

    const adminUser = user as AdminJwtPayload;

    // Role check
    if (![Role.ADMIN, Role.SUPER_ADMIN].includes(adminUser.role)) {
      throw new ForbiddenException('Admin access required');
    }

    // SUPER_ADMIN bypasses all scope checks
    if (adminUser.role === Role.SUPER_ADMIN) {
      return true;
    }

    // Extract cityId from request
    const cityId =
      req.params.cityId ??
      req.body.cityId ??
      req.query.cityId;

    if (!cityId) {
      throw new ForbiddenException('Missing city scope');
    }

    // Admin can only access their assigned city
    if (adminUser.cityId !== cityId) {
      throw new ForbiddenException(
        `You are not authorized for city ${cityId}. Your city: ${adminUser.cityId}`,
      );
    }

    return true;
  }
}
