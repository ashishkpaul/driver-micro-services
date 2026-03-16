import {
  BadRequestException,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import {
  DeliveryAuthorizationService,
  DeliveryAction,
} from "./delivery-authorization.service";
import { Delivery } from "./entities/delivery.entity";
import { AuthorizationActor } from "../authorization/authorization.types";

const DELIVERY_STATE_TRANSITIONS: Record<Delivery["status"], Delivery["status"][]> = {
  PENDING: ["ASSIGNED", "CANCELLED"],
  ASSIGNED: ["PICKED_UP", "FAILED", "CANCELLED"],
  PICKED_UP: ["IN_TRANSIT", "DELIVERED", "FAILED"],
  IN_TRANSIT: ["DELIVERED", "FAILED"],
  FAILED: ["ASSIGNED", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: [],
};

@Injectable()
export class DeliveryStateMachine {
  constructor(
    private readonly deliveryAuthorizationService: DeliveryAuthorizationService,
  ) {}

  async assertTransitionAllowed(
    delivery: Delivery,
    toStatus: Delivery["status"],
    actor?: AuthorizationActor,
  ): Promise<void> {
    this.assertTransitionGraph(delivery.status, toStatus);

    if (!actor || actor.role === "SYSTEM") {
      return;
    }

    const action = this.mapStatusToAction(toStatus);
    if (!action) {
      return;
    }

    const actorId = actor.driverId || actor.userId;
    if (!actorId || !actor.role) {
      throw new ForbiddenException("MISSING_AUTHORIZATION_CONTEXT");
    }

    const auth = await this.deliveryAuthorizationService.canPerformAction(
      actorId,
      actor.role,
      actor.cityId,
      delivery.id,
      action,
    );

    if (!auth.allowed) {
      throw new ForbiddenException(auth.reason || "DELIVERY_ACTION_FORBIDDEN");
    }
  }

  private assertTransitionGraph(
    fromStatus: Delivery["status"],
    toStatus: Delivery["status"],
  ): void {
    if (fromStatus === toStatus) {
      return;
    }

    const allowedTransitions = DELIVERY_STATE_TRANSITIONS[fromStatus] || [];
    if (!allowedTransitions.includes(toStatus)) {
      throw new BadRequestException(
        `Invalid delivery status transition: ${fromStatus} -> ${toStatus}`,
      );
    }
  }

  private mapStatusToAction(status: Delivery["status"]): DeliveryAction | undefined {
    switch (status) {
      case "PICKED_UP":
        return "PICKUP";
      case "DELIVERED":
        return "DELIVER";
      case "FAILED":
      case "CANCELLED":
        return "CANCEL";
      case "ASSIGNED":
        return "REASSIGN";
      default:
        return undefined;
    }
  }
}
