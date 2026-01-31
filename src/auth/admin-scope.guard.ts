// src/auth/admin-scope.guard.ts
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from '@nestjs/common';
import { Role } from './roles.enum';

interface AdminJwtPayload {
  sub: string;
  role: Role;
  scope?: {
    cities?: string[];
    zones?: string[];
  };
}

export class AdminScopeGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest();
    const user = req.user as AdminJwtPayload | undefined;

    if (!user) {
      throw new UnauthorizedException('Missing authentication');
    }

    // Role check
    if (![Role.ADMIN, Role.SUPER_ADMIN].includes(user.role)) {
      throw new ForbiddenException('Admin access required');
    }

    // SUPER_ADMIN bypasses all scope checks
    if (user.role === Role.SUPER_ADMIN) {
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

    if (!user.scope?.cities?.includes(cityId)) {
      throw new ForbiddenException(
        `You are not authorized for city ${cityId}`,
      );
    }

    return true;
  }
}
