import { PermissionType } from "../auth/permissions";

export interface AuthorizationActor {
  userId?: string;
  driverId?: string;
  role?: string;
  type?: string;
  permissions: PermissionType[];
  cityId?: string;
  zoneId?: string;
  isActive?: boolean;
  status?: string;
}

export interface AuthorizationResourceContext {
  deliveryId?: string;
  driverId?: string;
  cityId?: string;
  zoneId?: string;
  path?: string;
  method?: string;
  body?: Record<string, unknown>;
}

export interface AuthorizationDecision {
  allowed: boolean;
  reason?: string;
}
