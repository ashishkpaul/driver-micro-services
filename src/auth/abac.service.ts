// src/auth/abac.service.ts
import { Injectable } from "@nestjs/common";

interface AccessContext {
  timeOfDay: number; // 0-23
  dayOfWeek: number; // 0-6
  driverStatus: string;
  driverLocation?: { lat: number; lon: number };
  deliveryZoneStatus: string;
  weatherAlert?: string;
}

@Injectable()
export class AbacService {
  /**
   * Check if driver can accept deliveries based on dynamic context
   */
  canAcceptDeliveries(context: AccessContext): {
    allowed: boolean;
    reason?: string;
  } {
    // Time-based restrictions (e.g., no new assignments 30 mins before shift end)
    if (context.timeOfDay >= 23 || context.timeOfDay < 5) {
      return { allowed: false, reason: "OUTSIDE_OPERATING_HOURS" };
    }

    // Zone-based restrictions (e.g., curfew, high-risk area)
    if (context.deliveryZoneStatus === "LOCKDOWN") {
      return { allowed: false, reason: "ZONE_LOCKED_DOWN" };
    }

    // Weather-based restrictions
    if (context.weatherAlert === "SEVERE") {
      return { allowed: false, reason: "WEATHER_ALERT" };
    }

    return { allowed: true };
  }

  /**
   * Check if admin can perform high-risk operations
   */
  canPerformHighRiskOperation(
    adminRole: string,
    operation: string,
    context: AccessContext,
  ): { allowed: boolean; requiresMfa?: boolean } {
    // Super admin always allowed but may require MFA for destructive ops
    if (adminRole === "SUPER_ADMIN") {
      const requiresMfa = ["DELETE_DRIVER", "DELETE_ADMIN"].includes(operation);
      return { allowed: true, requiresMfa };
    }

    // Regular admins have time-based restrictions for sensitive ops
    if (operation === "FORCE_ASSIGN_DRIVER" && context.timeOfDay >= 22) {
      return { allowed: false }; // No force assigns after 10 PM
    }

    return { allowed: true };
  }
}
