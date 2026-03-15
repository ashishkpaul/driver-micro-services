import { Injectable } from '@nestjs/common';
import { PermissionType } from '../auth/permissions';
import {
  AuthorizationActor,
  AuthorizationDecision,
  AuthorizationResourceContext,
} from './authorization.types';
import { DriverPolicy } from './driver.policy';
import { DeliveryPolicy } from './delivery.policy';
import { AssignmentPolicy } from './assignment.policy';

@Injectable()
export class AuthorizationService {
  constructor(
    private readonly driverPolicy: DriverPolicy,
    private readonly deliveryPolicy: DeliveryPolicy,
    private readonly assignmentPolicy: AssignmentPolicy,
  ) {}

  async authorize(
    actor: AuthorizationActor,
    permission: PermissionType,
    resource: AuthorizationResourceContext,
  ): Promise<AuthorizationDecision> {
    if (actor.role === 'SYSTEM' || actor.type === 'system') {
      return { allowed: true };
    }

    if (actor.role === 'SUPER_ADMIN') {
      return { allowed: true };
    }

    if (!actor.permissions?.includes(permission)) {
      return { allowed: false, reason: 'MISSING_PERMISSION' };
    }

    const assignmentDecision = this.assignmentPolicy.evaluate(actor, permission);
    if (!assignmentDecision.allowed) {
      return assignmentDecision;
    }

    const driverDecision = this.driverPolicy.evaluate(actor, permission, resource);
    if (!driverDecision.allowed) {
      return driverDecision;
    }

    const deliveryDecision = await this.deliveryPolicy.evaluate(
      actor,
      permission,
      resource,
    );
    if (!deliveryDecision.allowed) {
      return deliveryDecision;
    }

    const scopeDecision = this.evaluateAdminScope(actor, permission, resource);
    if (!scopeDecision.allowed) {
      return scopeDecision;
    }

    return { allowed: true };
  }

  private evaluateAdminScope(
    actor: AuthorizationActor,
    permission: PermissionType,
    resource: AuthorizationResourceContext,
  ): AuthorizationDecision {
    const isAdminPermission = permission.startsWith('admin:') || permission.startsWith('assignment:');
    if (!isAdminPermission) {
      return { allowed: true };
    }

    if (!actor.role) {
      return { allowed: false, reason: 'MISSING_ROLE' };
    }

    if (actor.role === 'ADMIN' || actor.role === 'CITY_ADMIN' || actor.role === 'DISPATCHER' || actor.role === 'OPS_ADMIN') {
      if (!actor.cityId) {
        return { allowed: false, reason: 'MISSING_ADMIN_CITY_SCOPE' };
      }

      if (resource.cityId && resource.cityId !== actor.cityId) {
        return { allowed: false, reason: 'CITY_SCOPE_VIOLATION' };
      }
    }

    return { allowed: true };
  }
}
