import { ForbiddenException, Injectable } from '@nestjs/common';
import { Permission } from '../auth/permissions';
import { AuthorizationActor } from '../authorization/authorization.types';

const ASSIGNMENT_ROLES = new Set([
  'DISPATCHER',
  'OPS_ADMIN',
  'CITY_ADMIN',
  'ADMIN',
  'SUPER_ADMIN',
  'SYSTEM',
]);

@Injectable()
export class AssignmentAuthorizationService {
  ensureCanAssign(
    actor: AuthorizationActor,
    context?: { targetCityId?: string },
  ): void {
    if (actor.role === 'SYSTEM' || actor.type === 'system') {
      return;
    }

    if (!actor.role || !ASSIGNMENT_ROLES.has(actor.role)) {
      throw new ForbiddenException('Actor is not allowed to assign deliveries');
    }

    if (!actor.permissions?.includes(Permission.ASSIGNMENT_CREATE) &&
        !actor.permissions?.includes(Permission.ASSIGNMENT_REASSIGN) &&
        !actor.permissions?.includes(Permission.ADMIN_FORCE_ASSIGN_DRIVER)) {
      throw new ForbiddenException('Missing assignment permission');
    }

    if (actor.cityId && context?.targetCityId && actor.cityId !== context.targetCityId) {
      throw new ForbiddenException('Assignment outside city scope is not allowed');
    }
  }
}
