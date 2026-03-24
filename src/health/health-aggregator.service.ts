import { Injectable } from '@nestjs/common';
import { SystemReadinessService } from '../bootstrap/system-readiness.service';
import { FeatureStatusService } from '../bootstrap/feature-status.service';
import { DbPoolLogger } from '../observability/db-pool.logger';
import { PushNotificationService } from '../push/push.service';
import { SchemaControlPlaneService } from '../schema/services/schema-control-plane.service';

@Injectable()
export class HealthAggregatorService {
  constructor(
    private readinessService: SystemReadinessService,
    private featureStatusService: FeatureStatusService,
    private dbPoolLogger: DbPoolLogger,
    private pushService: PushNotificationService,
    private schemaControlPlaneService: SchemaControlPlaneService,
  ) {}

  async getSystemStatus() {
    const readinessState = this.readinessService.getReadinessState();
    const featureReport = await this.featureStatusService.generateFeatureReport();
    const dbPoolStatus = await this.dbPoolLogger.getPoolStatus();
    const schemaStatus = await this.schemaControlPlaneService.getSchemaStatus();

    return {
      system: {
        ready: readinessState.isReady,
        currentPhase: readinessState.currentPhase,
        completedPhases: Array.from(readinessState.completedPhases),
      },
      database: {
        connected: schemaStatus.connected,
        version: schemaStatus.version,
        driftDetected: schemaStatus.driftDetected,
        lastConvergence: schemaStatus.lastConvergence,
        pool: {
          healthy: dbPoolStatus.healthy,
          poolSize: dbPoolStatus.poolSize,
          activeConnections: dbPoolStatus.activeConnections,
          utilization: dbPoolStatus.utilization,
          waitingClients: dbPoolStatus.waitingClients,
        },
      },
      features: {
        push: featureReport.push,
        redis: featureReport.redis,
        realtime: featureReport.realtime,
        outbox: featureReport.outbox,
      },
      services: {
        push: this.pushService.isEnabled() ? 'ENABLED' : 'DISABLED',
      },
    };
  }

  async getFeatureStatus() {
    return await this.featureStatusService.generateFeatureReport();
  }

  async getDbPoolStatus() {
    return await this.dbPoolLogger.getPoolStatus();
  }

  async getSchemaStatus() {
    return await this.schemaControlPlaneService.getSchemaStatus();
  }

  getReadinessState() {
    return this.readinessService.getReadinessState();
  }
}