import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { SystemReadinessService } from '../bootstrap/system-readiness.service';
import { FeatureStatusService } from '../bootstrap/feature-status.service';
import { DbPoolLogger } from '../observability/db-pool.logger';
import { PushNotificationService } from '../push/push.service';
import { SchemaControlPlaneService } from '../schema/services/schema-control-plane.service';
import { DataSource } from 'typeorm';

@Injectable()
export class HealthAggregatorService {
  constructor(
    private readinessService: SystemReadinessService,
    private featureStatusService: FeatureStatusService,
    private dbPoolLogger: DbPoolLogger,
    private pushService: PushNotificationService,
    private schemaControlPlaneService: SchemaControlPlaneService,
    @InjectDataSource() private dataSource: DataSource,
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
        status: schemaStatus.status,
        error: schemaStatus.error,
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

  async getDbPoolStatus(includeDetails: boolean = false) {
    if (!includeDetails) {
      return await this.dbPoolLogger.getPoolStatus();
    }

    // Get comprehensive database metrics
    const detailedMetrics = await this.dbPoolLogger.getDatabaseMetrics();
    
    return {
      ...detailedMetrics,
      timestamp: new Date().toISOString(),
    };
  }

  async getSchemaStatus(includeDetails: boolean = false) {
    const schemaStatus = await this.schemaControlPlaneService.getSchemaStatus();
    
    if (!includeDetails) {
      return schemaStatus;
    }

    // Add detailed schema information
    const detailedSchemaInfo = await this.getDetailedSchemaInfo();
    
    return {
      ...schemaStatus,
      ...detailedSchemaInfo,
      timestamp: new Date().toISOString(),
    };
  }

  async getSystemMetrics() {
    const readinessState = this.readinessService.getReadinessState();
    const dbPoolStatus = await this.dbPoolLogger.getPoolStatus();
    const schemaStatus = await this.schemaControlPlaneService.getSchemaStatus();
    const featureReport = await this.featureStatusService.generateFeatureReport();

    return {
      timestamp: new Date().toISOString(),
      system: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        cpu: process.cpuUsage(),
        version: process.version,
        platform: process.platform,
        nodeVersion: process.version,
      },
      readiness: {
        ready: readinessState.isReady,
        currentPhase: readinessState.currentPhase,
        completedPhases: Array.from(readinessState.completedPhases),
      },
      database: {
        connected: schemaStatus.connected,
        version: schemaStatus.version,
        driftDetected: schemaStatus.driftDetected,
        pool: dbPoolStatus,
      },
      features: featureReport,
      services: {
        push: this.pushService.isEnabled() ? 'ENABLED' : 'DISABLED',
      },
    };
  }

  async getComponentHealth() {
    const readinessState = this.readinessService.getReadinessState();
    const dbPoolStatus = await this.dbPoolLogger.getPoolStatus();
    const schemaStatus = await this.schemaControlPlaneService.getSchemaStatus();
    const featureReport = await this.featureStatusService.generateFeatureReport();

    return {
      timestamp: new Date().toISOString(),
      components: {
        database: {
          status: schemaStatus.connected ? 'HEALTHY' : 'UNHEALTHY',
          dependencies: [],
          details: {
            version: schemaStatus.version,
            driftDetected: schemaStatus.driftDetected,
            poolHealth: dbPoolStatus.healthy,
            poolUtilization: dbPoolStatus.utilization,
          },
        },
        redis: {
          status: featureReport.redis === 'ENABLED' ? 'HEALTHY' : 'DEGRADED',
          dependencies: ['database'],
          details: {
            enabled: featureReport.redis === 'ENABLED',
            impact: 'Redis cache and session storage',
          },
        },
        outbox: {
          status: featureReport.outbox === 'ENABLED' ? 'HEALTHY' : 'DEGRADED',
          dependencies: ['database'],
          details: {
            enabled: featureReport.outbox === 'ENABLED',
            impact: 'Domain event processing and outbox pattern',
          },
        },
        realtime: {
          status: featureReport.realtime === 'ENABLED' ? 'HEALTHY' : 'DEGRADED',
          dependencies: ['redis'],
          details: {
            enabled: featureReport.realtime === 'ENABLED',
            impact: 'Real-time notifications and WebSocket connections',
          },
        },
        push: {
          status: this.pushService.isEnabled() ? 'HEALTHY' : 'DISABLED',
          dependencies: ['redis'],
          details: {
            enabled: this.pushService.isEnabled(),
            impact: 'Push notifications for driver assignments and updates',
          },
        },
        schema: {
          status: schemaStatus.driftDetected ? 'WARNING' : 'HEALTHY',
          dependencies: ['database'],
          details: {
            driftDetected: schemaStatus.driftDetected,
            lastConvergence: schemaStatus.lastConvergence,
            version: schemaStatus.version,
          },
        },
        system: {
          status: readinessState.isReady ? 'HEALTHY' : 'STARTING',
          dependencies: ['database', 'schema'],
          details: {
            currentPhase: readinessState.currentPhase,
            completedPhases: Array.from(readinessState.completedPhases),
          },
        },
      },
    };
  }

  async getHealthSummary() {
    const readinessState = this.readinessService.getReadinessState();
    const dbPoolStatus = await this.dbPoolLogger.getPoolStatus();
    const schemaStatus = await this.schemaControlPlaneService.getSchemaStatus();
    const featureReport = await this.featureStatusService.generateFeatureReport();

    const criticalIssues = this.getCriticalIssues(schemaStatus, dbPoolStatus, featureReport);
    const overallHealth = this.calculateOverallHealth(schemaStatus, dbPoolStatus, featureReport);

    return {
      timestamp: new Date().toISOString(),
      overallHealth,
      systemReady: readinessState.isReady,
      criticalIssues,
      summary: {
        database: schemaStatus.connected ? 'HEALTHY' : 'UNHEALTHY',
        schema: schemaStatus.driftDetected ? 'WARNING' : 'HEALTHY',
        redis: featureReport.redis === 'ENABLED' ? 'HEALTHY' : 'DEGRADED',
        realtime: featureReport.realtime === 'ENABLED' ? 'HEALTHY' : 'DEGRADED',
        push: this.pushService.isEnabled() ? 'HEALTHY' : 'DISABLED',
        outbox: featureReport.outbox === 'ENABLED' ? 'HEALTHY' : 'DEGRADED',
      },
      metrics: {
        poolUtilization: dbPoolStatus.utilization,
        activeConnections: dbPoolStatus.activeConnections,
        poolSize: dbPoolStatus.poolSize,
      },
    };
  }

  private async getDetailedPoolInfo() {
    try {
      // Get more detailed PostgreSQL connection information
      const result = await this.dataSource.query(`
        SELECT 
          (SELECT count(*) FROM pg_stat_activity WHERE state = 'active') as active_connections,
          (SELECT count(*) FROM pg_stat_activity WHERE state = 'idle') as idle_connections,
          (SELECT count(*) FROM pg_stat_activity WHERE state = 'idle in transaction') as idle_in_transaction,
          (SELECT count(*) FROM pg_stat_activity WHERE state = 'idle in transaction (aborted)') as idle_in_transaction_aborted,
          (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') as max_connections,
          (SELECT count(*) FROM pg_stat_activity WHERE wait_event_type = 'Lock') as waiting_for_locks,
          (SELECT count(*) FROM pg_stat_activity WHERE wait_event_type = 'LWLock') as waiting_for_lwlocks
      `);

      return {
        detailed: {
          idleConnections: result[0]?.idle_connections || 0,
          idleInTransaction: result[0]?.idle_in_transaction || 0,
          idleInTransactionAborted: result[0]?.idle_in_transaction_aborted || 0,
          waitingForLocks: result[0]?.waiting_for_locks || 0,
          waitingForLWLocks: result[0]?.waiting_for_lwlocks || 0,
          maxConnections: result[0]?.max_connections || 100,
        },
      };
    } catch (error) {
      return {
        detailed: {
          error: 'Could not retrieve detailed pool information',
        },
      };
    }
  }

  private async getDetailedSchemaInfo() {
    try {
      // Get detailed schema information
      const result = await this.dataSource.query(`
        SELECT 
          (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public') as table_count,
          (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public') as column_count,
          (SELECT count(*) FROM information_schema.views WHERE table_schema = 'public') as view_count,
          (SELECT count(*) FROM information_schema.routines WHERE routine_schema = 'public') as function_count
      `);

      return {
        detailed: {
          tableCount: result[0]?.table_count || 0,
          columnCount: result[0]?.column_count || 0,
          viewCount: result[0]?.view_count || 0,
          functionCount: result[0]?.function_count || 0,
        },
      };
    } catch (error) {
      return {
        detailed: {
          error: 'Could not retrieve detailed schema information',
        },
      };
    }
  }

  private getCriticalIssues(schemaStatus: any, dbPoolStatus: any, featureReport: any): string[] {
    const issues: string[] = [];

    if (!schemaStatus.connected) {
      issues.push('Database connection failed');
    }

    if (schemaStatus.driftDetected) {
      issues.push('Schema drift detected - database schema does not match application expectations');
    }

    if (!dbPoolStatus.healthy) {
      issues.push('Database pool unhealthy - high utilization or connection issues');
    }

    if (featureReport.redis !== 'ENABLED') {
      issues.push('Redis disabled - realtime features will be degraded');
    }

    if (featureReport.outbox !== 'ENABLED') {
      issues.push('Outbox disabled - domain events may not be processed');
    }

    return issues;
  }

  private calculateOverallHealth(schemaStatus: any, dbPoolStatus: any, featureReport: any): string {
    if (!schemaStatus.connected || schemaStatus.driftDetected) {
      return 'CRITICAL';
    }

    if (!dbPoolStatus.healthy || featureReport.redis !== 'ENABLED' || featureReport.outbox !== 'ENABLED') {
      return 'WARNING';
    }

    return 'HEALTHY';
  }

  getReadinessState() {
    return this.readinessService.getReadinessState();
  }
}