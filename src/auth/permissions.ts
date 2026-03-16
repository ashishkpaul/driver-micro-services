// src/auth/permissions.ts
export const Permission = {
  // Driver permissions
  DRIVER_READ_OWN_PROFILE: "driver:read:own_profile",
  DRIVER_UPDATE_OWN_LOCATION: "driver:update:own_location",
  DRIVER_READ_OWN_EARNINGS: "driver:read:own_earnings",
  DRIVER_ACCEPT_DELIVERY: "driver:action:accept_delivery",
  DRIVER_REJECT_DELIVERY: "driver:action:reject_delivery",
  DRIVER_UPDATE_DELIVERY_STATUS: "driver:update:delivery_status",
  DRIVER_CONTACT_CUSTOMER: "driver:action:contact_customer",
  DRIVER_CONTACT_SELLER: "driver:action:contact_seller",
  DRIVER_UPLOAD_PROOF: "driver:action:upload_proof",

  // Assignment permissions
  ASSIGNMENT_CREATE: "assignment:create:any",
  ASSIGNMENT_REASSIGN: "assignment:reassign:any",

  // Admin permissions (scoped)
  ADMIN_READ_DRIVER_ANY: "admin:read:driver:any",
  ADMIN_UPDATE_DRIVER_STATUS: "admin:update:driver_status",
  ADMIN_CREATE_DRIVER: "admin:create:driver",
  ADMIN_DELETE_DRIVER: "admin:delete:driver",
  ADMIN_READ_DELIVERY_ANY: "admin:read:delivery:any",
  ADMIN_READ_ADMIN_ANY: "admin:read:admin:any",
  ADMIN_UPDATE_ADMIN: "admin:update:admin",
  ADMIN_READ_AUDIT_OWN: "admin:read:audit:own",
  ADMIN_FORCE_ASSIGN_DRIVER: "admin:action:force_assign_driver",
  ADMIN_CANCEL_DELIVERY: "admin:action:cancel_delivery",
  ADMIN_RETRY_DISPATCH: "admin:action:retry_dispatch",
  ADMIN_OVERRIDE_DELIVERY: "admin:action:override_delivery",
  ADMIN_READ_ZONE_ANY: "admin:read:zone:any",
  ADMIN_UPDATE_ZONE_CONFIG: "admin:update:zone_config",

  // Super admin permissions
  SUPER_ADMIN_CREATE_ADMIN: "super_admin:create:admin",
  SUPER_ADMIN_DELETE_ADMIN: "super_admin:delete:admin",
  SUPER_ADMIN_READ_AUDIT_ANY: "super_admin:read:audit:any",
  SUPER_ADMIN_READ_SYSTEM_STATS: "super_admin:read:system_stats",
  SUPER_ADMIN_RESET_ADMIN_PASSWORD: "super_admin:reset:admin_password",
  SUPER_ADMIN_MANAGE_CITIES: "super_admin:manage:cities",
  SUPER_ADMIN_MANAGE_ZONES: "super_admin:manage:zones",

  // System permissions (for service-to-service)
  SYSTEM_WEBHOOK_INBOUND: "system:webhook:inbound",
  SYSTEM_READ_DRIVER_LOCATION: "system:read:driver_location",
} as const;

export type PermissionType = (typeof Permission)[keyof typeof Permission];

// Permission groups for role assignment
export const RolePermissions = {
  DRIVER: [
    Permission.DRIVER_READ_OWN_PROFILE,
    Permission.DRIVER_UPDATE_OWN_LOCATION,
    Permission.DRIVER_READ_OWN_EARNINGS,
    Permission.DRIVER_ACCEPT_DELIVERY,
    Permission.DRIVER_REJECT_DELIVERY,
    Permission.DRIVER_UPDATE_DELIVERY_STATUS,
    Permission.DRIVER_CONTACT_CUSTOMER,
    Permission.DRIVER_CONTACT_SELLER,
    Permission.DRIVER_UPLOAD_PROOF,
  ],

  ADMIN: [
    ...Object.values(Permission).filter((p) => p.startsWith("admin:")),
    Permission.ASSIGNMENT_CREATE,
    Permission.ASSIGNMENT_REASSIGN,
  ],

  DISPATCHER: [
    Permission.ADMIN_READ_DELIVERY_ANY,
    Permission.ADMIN_FORCE_ASSIGN_DRIVER,
    Permission.ASSIGNMENT_CREATE,
    Permission.ASSIGNMENT_REASSIGN,
    Permission.ADMIN_RETRY_DISPATCH,
  ],

  OPS_ADMIN: [
    Permission.ADMIN_READ_DRIVER_ANY,
    Permission.ADMIN_UPDATE_DRIVER_STATUS,
    Permission.ADMIN_CANCEL_DELIVERY,
    Permission.ADMIN_OVERRIDE_DELIVERY,
    Permission.ADMIN_RETRY_DISPATCH,
    Permission.ADMIN_READ_DELIVERY_ANY,
    Permission.ASSIGNMENT_REASSIGN,
  ],

  CITY_ADMIN: [
    Permission.ADMIN_READ_DRIVER_ANY,
    Permission.ADMIN_UPDATE_DRIVER_STATUS,
    Permission.ADMIN_READ_DELIVERY_ANY,
    Permission.ADMIN_FORCE_ASSIGN_DRIVER,
    Permission.ADMIN_CANCEL_DELIVERY,
    Permission.ADMIN_RETRY_DISPATCH,
    Permission.ASSIGNMENT_CREATE,
    Permission.ASSIGNMENT_REASSIGN,
  ],

  SUPER_ADMIN: [
    ...Object.values(Permission).filter((p) => p.startsWith("super_admin:")),
    ...Object.values(Permission).filter((p) => p.startsWith("admin:")),
    ...Object.values(Permission).filter((p) => p.startsWith("assignment:")),
  ],

  SYSTEM: [
    Permission.SYSTEM_WEBHOOK_INBOUND,
    Permission.SYSTEM_READ_DRIVER_LOCATION,
  ],
};
