import { Role } from "./roles.enum";

export interface BaseJwtPayload {
  sub: string;
  type: "driver" | "admin";
  role: Role;
  isActive: boolean;
}

export interface DriverJwtPayload extends BaseJwtPayload {
  driverId: string;
  email?: string;
  cityId?: string;
  zoneId?: string;
  permissions?: string[];
  deviceId?: string;
}

export interface AdminJwtPayload extends BaseJwtPayload {
  userId: string;
  email: string;
  cityId?: string;
  permissions?: string[];
}

export type JwtPayload = DriverJwtPayload | AdminJwtPayload;
