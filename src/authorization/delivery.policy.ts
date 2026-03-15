import { Injectable } from '@nestjs/common';
import { DeliveryAuthorizationService, DeliveryAction } from '../deliveries/delivery-authorization.service';
import { Permission, PermissionType } from '../auth/permissions';
import {
  AuthorizationActor,
  AuthorizationDecision,
  AuthorizationResourceContext,
} from './authorization.types';

@Injectable()
export class DeliveryPolicy {
  constructor(
    private readonly deliveryAuthorizationService: DeliveryAuthorizationService,
  ) {}

  async evaluate(
    actor: AuthorizationActor,
    permission: PermissionType,
    resource: AuthorizationResourceContext,
  ): Promise<AuthorizationDecision> {
    const action = this.resolveAction(permission, resource);
    if (!action || !resource.deliveryId) {
      return { allowed: true };
    }

    const actorId = actor.driverId || actor.userId;
    if (!actorId || !actor.role) {
      return { allowed: false, reason: 'MISSING_ACTOR_CONTEXT' };
    }

    const decision = await this.deliveryAuthorizationService.canPerformAction(
      actorId,
      actor.role,
      actor.cityId,
      resource.deliveryId,
      action,
    );

    return { allowed: decision.allowed, reason: decision.reason };
  }

  private resolveAction(
    permission: PermissionType,
    resource: AuthorizationResourceContext,
  ): DeliveryAction | undefined {
    if (permission === Permission.ADMIN_READ_DELIVERY_ANY) return 'VIEW';
    if (permission === Permission.ADMIN_CANCEL_DELIVERY) return 'CANCEL';
    if (permission === Permission.ADMIN_RETRY_DISPATCH) return 'RETRY';
    if (permission === Permission.ADMIN_FORCE_ASSIGN_DRIVER) return 'REASSIGN';

    if (permission === Permission.DRIVER_UPDATE_DELIVERY_STATUS) {
      const status = resource.body?.status;
      if (status === 'PICKED_UP') return 'PICKUP';
      if (status === 'DELIVERED' || status === 'IN_TRANSIT') return 'DELIVER';
      if (status === 'CANCELLED') return 'CANCEL';
      return 'VIEW';
    }

    return undefined;
  }
}
