import { Injectable } from '@nestjs/common';
import { PermissionType } from '../auth/permissions';
import {
  AuthorizationActor,
  AuthorizationDecision,
  AuthorizationResourceContext,
} from './authorization.types';

@Injectable()
export class DriverPolicy {
  evaluate(
    actor: AuthorizationActor,
    permission: PermissionType,
    resource: AuthorizationResourceContext,
  ): AuthorizationDecision {
    if (!permission.startsWith('driver:')) {
      return { allowed: true };
    }

    const actorDriverId = actor.driverId;
    const targetDriverId = resource.driverId;

    if (targetDriverId && actorDriverId && targetDriverId !== actorDriverId) {
      return { allowed: false, reason: 'DRIVER_OWNERSHIP_VIOLATION' };
    }

    if (actor.isActive === false && permission !== 'driver:read:own_profile') {
      return { allowed: false, reason: 'DRIVER_INACTIVE' };
    }

    return { allowed: true };
  }
}
