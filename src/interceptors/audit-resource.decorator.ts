import { SetMetadata } from "@nestjs/common";

export const AUDIT_RESOURCE_KEY = "auditResource";

export interface AuditResourceOptions {
  resourceType: string;
  resourceIdParam?: string; // Parameter name to extract resource ID from (e.g., 'id', 'driverId')
  action?: string; // Override action name (default: derived from HTTP method)
}

/**
 * Decorator to mark a controller method with audit resource information
 *
 * @example
 * @AuditResource({ resourceType: 'DRIVER', resourceIdParam: 'id' })
 * @Patch(':id')
 * updateDriver(@Param('id') id: string, @Body() dto: UpdateDriverDto) { ... }
 *
 * @example
 * @AuditResource({ resourceType: 'DELIVERY', resourceIdParam: 'id', action: 'ASSIGN_DRIVER' })
 * @Patch(':id/assign')
 * assignDriver(@Param('id') id: string, @Body() body: { driverId: string }) { ... }
 */
export const AuditResource = (options: AuditResourceOptions) =>
  SetMetadata(AUDIT_RESOURCE_KEY, options);
