import { Injectable } from '@nestjs/common';
import { PermissionType } from '../auth/permissions';
import {
  AuthorizationActor,
  AuthorizationDecision,
} from './authorization.types';

const ASSIGNMENT_ROLES = new Set([
  'DISPATCHER',
  'OPS_ADMIN',
  'CITY_ADMIN',
  'ADMIN',
  'SUPER_ADMIN',
  'SYSTEM',
]);

@Injectable()
export class AssignmentPolicy {
  evaluate(
    actor: AuthorizationActor,
    permission: PermissionType,
  ): AuthorizationDecision {
    if (!permission.startsWith('assignment:')) {
      return { allowed: true };
    }

    if (!actor.role || !ASSIGNMENT_ROLES.has(actor.role)) {
      return { allowed: false, reason: 'ASSIGNMENT_ROLE_REQUIRED' };
    }

    return { allowed: true };
  }
}
