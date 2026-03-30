// src/interceptors/audit-logging.interceptor.ts
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Observable } from "rxjs";
import { tap } from "rxjs/operators";
import { AuditService } from "../services/audit.service";
import { Request } from "express";
import {
  AUDIT_RESOURCE_KEY,
  AuditResourceOptions,
} from "./audit-resource.decorator";

export interface AuditMetadata {
  action: string;
  resourceType: string;
  resourceId?: string;
  skipLogging?: boolean;
}

@Injectable()
export class AuditLoggingInterceptor implements NestInterceptor {
  constructor(
    private auditService: AuditService,
    private reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const response = context.switchToHttp().getResponse();

    // Skip logging for GET requests (read-only operations)
    if (request.method === "GET") {
      return next.handle();
    }

    // Get audit metadata from request (can be set by decorators)
    const auditMetadata: AuditMetadata = (request as any).auditMetadata || {};

    if (auditMetadata.skipLogging) {
      return next.handle();
    }

    // Get @AuditResource decorator metadata from handler
    const auditResourceOptions = this.reflector.get<AuditResourceOptions>(
      AUDIT_RESOURCE_KEY,
      context.getHandler(),
    );

    return next.handle().pipe(
      tap(async (data) => {
        try {
          // Determine action based on HTTP method or decorator override
          let action =
            auditResourceOptions?.action ||
            this.getActionName(request.method, request.url);

          // Determine resource type and ID
          let resourceType: string;
          let resourceId: string | undefined;

          if (auditResourceOptions) {
            // Use decorator metadata for reliable resource extraction
            resourceType = auditResourceOptions.resourceType;
            resourceId = this.extractResourceIdFromParams(
              request,
              auditResourceOptions.resourceIdParam,
            );
          } else {
            // Fallback to URL-based extraction
            const info = this.getResourceInfo(request);
            resourceType = info.resourceType;
            resourceId = info.resourceId;
          }

          // Only log if we have the required information
          if (action && resourceType) {
            const changes = this.extractChanges(request, data);

            await this.auditService.logFromRequest(
              request,
              action,
              resourceType,
              resourceId || "unknown",
              changes,
            );

            // Print structured audit log to console
            console.log("");
            console.log("┌─ 📋 AUDIT EVENT " + "─".repeat(33));
            console.log(`│  Actor: ${request.ip || "unknown"}`);
            console.log(`│  Action: ${action}`);
            console.log(
              `│  Resource: ${resourceType}${resourceId ? `/${resourceId}` : ""}`,
            );
            console.log(
              `│  Trace: ${request.headers["x-correlation-id"] || "N/A"}`,
            );
            console.log("└" + "─".repeat(49));
          }
        } catch (error) {
          // Don't throw errors for audit logging failures
          console.error("Audit logging failed:", error);
        }
      }),
    );
  }

  /**
   * Extract resource ID from request parameters using the specified param name
   */
  private extractResourceIdFromParams(
    request: Request,
    paramName?: string,
  ): string | undefined {
    if (!paramName) {
      return undefined;
    }

    const params = request.params;
    return params[paramName] || params.id || undefined;
  }

  private getActionName(method: string, url: string): string {
    switch (method) {
      case "POST":
        return "CREATE";
      case "PUT":
      case "PATCH":
        return "UPDATE";
      case "DELETE":
        return "DELETE";
      default:
        return method;
    }
  }

  private getResourceInfo(request: Request): {
    resourceType: string;
    resourceId?: string;
  } {
    const url = request.url;

    // Extract resource type and ID from URL
    // Examples:
    // /drivers/123 -> resourceType: 'DRIVER', resourceId: '123'
    // /admin/users/456 -> resourceType: 'ADMIN', resourceId: '456'
    // /deliveries/789/status -> resourceType: 'DELIVERY', resourceId: '789'

    const segments = url.split("/").filter(Boolean);

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];

      // Check for known resource patterns
      if (segment === "drivers") {
        return {
          resourceType: "DRIVER",
          resourceId: segments[i + 1] || undefined,
        };
      } else if (segment === "admin" && segments[i + 1] === "users") {
        return {
          resourceType: "ADMIN",
          resourceId: segments[i + 2] || undefined,
        };
      } else if (segment === "deliveries") {
        return {
          resourceType: "DELIVERY",
          resourceId: segments[i + 1] || undefined,
        };
      } else if (segment === "proofs") {
        return {
          resourceType: "PROOF",
          resourceId: segments[i + 1] || undefined,
        };
      } else if (segment === "cities") {
        return {
          resourceType: "CITY",
          resourceId: segments[i + 1] || undefined,
        };
      } else if (segment === "zones") {
        return {
          resourceType: "ZONE",
          resourceId: segments[i + 1] || undefined,
        };
      }
    }

    // Default fallback
    return {
      resourceType: "UNKNOWN",
      resourceId: undefined,
    };
  }

  private extractChanges(request: Request, responseData: any): any {
    const method = request.method;
    const body = request.body;
    const params = request.params;

    let changes: any = {};

    switch (method) {
      case "POST":
        // For create operations, log the created data
        changes.after = body;
        break;

      case "PUT":
      case "PATCH":
        // For update operations, log both before and after
        changes.after = body;
        // Note: We don't have access to the "before" state here
        // This would require additional logic in the service layer
        break;

      case "DELETE":
        // For delete operations, log the deleted resource ID
        changes.before = { id: params.id || params.userId || params.driverId };
        break;
    }

    // Add request metadata
    changes.request = {
      method: request.method,
      url: request.url,
      userAgent: request.headers["user-agent"],
      ip: this.getClientIp(request),
    };

    return changes;
  }

  private getClientIp(request: Request): string | undefined {
    return (
      (request.headers["x-forwarded-for"] as string) ||
      (request.headers["x-real-ip"] as string) ||
      request.connection.remoteAddress ||
      request.ip
    );
  }
}

/**
 * Decorator to set audit metadata on a request
 */
export function SetAuditMetadata(metadata: AuditMetadata) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = function (...args: any[]) {
      const request = args[0]; // Assuming first argument is the request
      if (request) {
        (request as any).auditMetadata = metadata;
      }
      return originalMethod.apply(this, args);
    };

    return descriptor;
  };
}
