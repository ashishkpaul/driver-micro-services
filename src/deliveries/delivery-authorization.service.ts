// src/deliveries/delivery-authorization.service.ts
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Delivery } from './entities/delivery.entity';

export type DeliveryAction = 
  | 'VIEW'
  | 'PICKUP'
  | 'DELIVER'
  | 'CANCEL'
  | 'REASSIGN'
  | 'RETRY'
  | 'VIEW_PROOFS';

@Injectable()
export class DeliveryAuthorizationService {
  constructor(
    @InjectRepository(Delivery)
    private readonly deliveryRepository: Repository<Delivery>,
  ) {}

  async canPerformAction(
    actorId: string,
    actorRole: string,
    actorCityId: string | undefined,
    deliveryId: string,
    action: DeliveryAction,
  ): Promise<{ allowed: boolean; reason?: string }> {
    const delivery = await this.deliveryRepository.findOne({ 
      where: { id: deliveryId },
    });

    if (!delivery) {
      return { allowed: false, reason: 'DELIVERY_NOT_FOUND' };
    }

    // SUPER_ADMIN can do anything
    if (actorRole === 'SUPER_ADMIN') {
      return { allowed: true };
    }

    // Check city scope for ADMIN
    if (actorRole === 'ADMIN') {
      // Need to resolve delivery's city from driver or order
      const deliveryCityId = await this.resolveDeliveryCity(delivery);
      if (deliveryCityId && deliveryCityId !== actorCityId) {
        return { allowed: false, reason: 'CITY_SCOPE_VIOLATION' };
      }
    }

    // Role-specific action permissions
    switch (action) {
      case 'VIEW':
        return this.checkViewPermission(actorId, actorRole, delivery);
      
      case 'PICKUP':
        return this.checkPickupPermission(actorId, delivery);
      
      case 'DELIVER':
        return this.checkDeliverPermission(actorId, delivery);
      
      case 'CANCEL':
        return this.checkCancelPermission(actorId, actorRole, delivery);
      
      case 'REASSIGN':
        return this.checkReassignPermission(actorRole, delivery);
      
      case 'RETRY':
        return this.checkRetryPermission(actorRole, delivery);
      
      default:
        return { allowed: false, reason: 'UNKNOWN_ACTION' };
    }
  }

  private checkViewPermission(
    actorId: string,
    actorRole: string,
    delivery: Delivery,
  ): { allowed: boolean; reason?: string } {
    // Driver can only view their own deliveries
    if (actorRole === 'DRIVER') {
      if (delivery.driverId !== actorId) {
        return { allowed: false, reason: 'NOT_ASSIGNED_DRIVER' };
      }
      return { allowed: true };
    }

    // Admin can view any in their scope (checked earlier)
    if (actorRole === 'ADMIN') {
      return { allowed: true };
    }

    return { allowed: false, reason: 'INSUFFICIENT_ROLE' };
  }

  private checkPickupPermission(
    actorId: string,
    delivery: Delivery,
  ): { allowed: boolean; reason?: string } {
    if (delivery.driverId !== actorId) {
      return { allowed: false, reason: 'NOT_ASSIGNED_DRIVER' };
    }

    if (delivery.status !== 'ASSIGNED') {
      return { allowed: false, reason: `INVALID_STATUS_${delivery.status}` };
    }

    // Check if driver is within pickup radius (would integrate with location service)
    return { allowed: true };
  }

  private checkDeliverPermission(
    actorId: string,
    delivery: Delivery,
  ): { allowed: boolean; reason?: string } {
    if (delivery.driverId !== actorId) {
      return { allowed: false, reason: 'NOT_ASSIGNED_DRIVER' };
    }

    if (delivery.status !== 'PICKED_UP' && delivery.status !== 'IN_TRANSIT') {
      return { allowed: false, reason: `INVALID_STATUS_${delivery.status}` };
    }

    return { allowed: true };
  }

  private checkCancelPermission(
    actorId: string,
    actorRole: string,
    delivery: Delivery,
  ): { allowed: boolean; reason?: string } {
    // Driver can cancel only if assigned and not yet picked up
    if (actorRole === 'DRIVER') {
      if (delivery.driverId !== actorId) {
        return { allowed: false, reason: 'NOT_ASSIGNED_DRIVER' };
      }
      if (delivery.status === 'PICKED_UP' || delivery.status === 'DELIVERED') {
        return { allowed: false, reason: 'ALREADY_PICKED_UP' };
      }
      return { allowed: true };
    }

    // Admin can cancel any delivery in scope
    if (actorRole === 'ADMIN' || actorRole === 'SUPER_ADMIN') {
      if (delivery.status === 'DELIVERED') {
        return { allowed: false, reason: 'ALREADY_DELIVERED' };
      }
      return { allowed: true };
    }

    return { allowed: false, reason: 'INSUFFICIENT_ROLE' };
  }

  private checkReassignPermission(
    actorRole: string,
    delivery: Delivery,
  ): { allowed: boolean; reason?: string } {
    // Only admin can force reassign
    if (actorRole !== 'ADMIN' && actorRole !== 'SUPER_ADMIN') {
      return { allowed: false, reason: 'ADMIN_ONLY_ACTION' };
    }

    if (delivery.status === 'DELIVERED' || delivery.status === 'CANCELLED') {
      return { allowed: false, reason: 'DELIVERY_TERMINAL_STATE' };
    }

    return { allowed: true };
  }

  private checkRetryPermission(
    actorRole: string,
    delivery: Delivery,
  ): { allowed: boolean; reason?: string } {
    if (actorRole !== 'ADMIN' && actorRole !== 'SUPER_ADMIN') {
      return { allowed: false, reason: 'ADMIN_ONLY_ACTION' };
    }

    if (delivery.status !== 'FAILED' && delivery.status !== 'CANCELLED') {
      return { allowed: false, reason: 'DELIVERY_NOT_FAILED' };
    }

    return { allowed: true };
  }

  private async resolveDeliveryCity(delivery: Delivery): Promise<string | undefined> {
    // Resolve from driver or from order via seller.
    // v1 entity does not include an eager driver relation here.
    // Keep scope decision permissive until explicit delivery-city mapping is modeled.
    return undefined;
  }
}
