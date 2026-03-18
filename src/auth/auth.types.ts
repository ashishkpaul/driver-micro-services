export type AuthenticatedUser = DriverAuthUser | AdminAuthUser | SystemAuthUser;

export interface BaseAuthUser {
  userId?: string;
  driverId?: string;
  email?: string;
  role: string;
  permissions: string[];
  cityId?: string;
  sub?: string;
  type?: string;
}

export interface DriverAuthUser extends BaseAuthUser {
  driverId: string;
  role: "DRIVER";
}

export interface AdminAuthUser extends BaseAuthUser {
  userId: string;
  role: string;
}

export interface SystemAuthUser extends BaseAuthUser {
  userId: string;
  role: "SYSTEM";
}
