// src/auth/authorization-audit.service.ts
import { Injectable } from '@nestjs/common';
import { AuditService } from '../services/audit.service';
import { Request } from 'express';

interface AuthorizationDecision {
  timestamp: Date;
  actorId: string;
  actorRole: string;
  action: string;
  resource: string;
  resourceId: string;
  decision: 'ALLOW' | 'DENY';
  reason?: string;
  context: Record<string, any>;
}

@Injectable()
export class AuthorizationAuditService {
  constructor(private readonly auditService: AuditService) {}

  async logAuthorization(
    request: Request,
    decision: AuthorizationDecision,
  ): Promise<void> {
    // Log successful authorizations at debug level, failures at warn
    const action = decision.decision === 'ALLOW' ? 'AUTHORIZATION_ALLOWED' : 'AUTHORIZATION_DENIED';
    
    await this.auditService.logFromRequest(
      request,
      action,
      'AUTHORIZATION',
      decision.resourceId,
      {
        actorId: decision.actorId,
        actorRole: decision.actorRole,
        requestedAction: decision.action,
        resource: decision.resource,
        decision: decision.decision,
        reason: decision.reason,
        context: decision.context,
        timestamp: decision.timestamp.toISOString(),
      },
    );

    // Real-time alert on suspicious patterns (e.g., 5+ denials in 1 minute)
    if (decision.decision === 'DENY') {
      await this.checkSuspiciousPattern(decision.actorId);
    }
  }

  private async checkSuspiciousPattern(actorId: string): Promise<void> {
    // Check recent denial count in Redis
    // Alert if threshold exceeded
    // Implementation...
  }
}
