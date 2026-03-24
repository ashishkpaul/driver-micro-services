import { Injectable } from '@nestjs/common';
import { HealthAggregatorService } from './health-aggregator.service';
import { SystemReadinessService } from '../bootstrap/system-readiness.service';
import { DbPoolLogger } from '../observability/db-pool.logger';
import { SchemaControlPlaneService } from '../schema/services/schema-control-plane.service';
import { FeatureStatusService } from '../bootstrap/feature-status.service';
import { PushNotificationService } from '../push/push.service';

export interface HealthDashboard {
  timestamp: string;
  systemOverview: {
    overallHealth: 'HEALTHY' | 'WARNING' | 'CRITICAL';
    systemReady: boolean;
    uptime: number;
    version: string;
  };
  componentStatus: {
    database: ComponentHealth;
    schema: ComponentHealth;
    redis: ComponentHealth;
    realtime: ComponentHealth;
    push: ComponentHealth;
    outbox: ComponentHealth;
    system: ComponentHealth;
  };
  performanceMetrics: {
    database: DatabaseMetrics;
    system: SystemMetrics;
  };
  alerts: Alert[];
  recommendations: string[];
}

export interface ComponentHealth {
  status: 'HEALTHY' | 'WARNING' | 'CRITICAL' | 'DISABLED' | 'STARTING';
  message: string;
  lastCheck: string;
  dependencies: string[];
}

export interface DatabaseMetrics {
  connectionPool: {
    healthy: boolean;
    utilization: number;
    activeConnections: number;
    poolSize: number;
    waitingClients: number;
  };
  performance: {
    activeQueries: number;
    longestRunningQuery: number;
    lockWaits: number;
    deadlocks: number;
  };
  health: {
    connectionHealth: boolean;
    queryPerformance: string;
    lockHealth: string;
    overallHealth: string;
  };
}

export interface SystemMetrics {
  memory: NodeJS.MemoryUsage;
  cpu: NodeJS.CpuUsage;
  uptime: number;
  version: string;
  platform: string;
}

export interface Alert {
  id: string;
  severity: 'CRITICAL' | 'WARNING' | 'INFO';
  title: string;
  message: string;
  timestamp: string;
  acknowledged: boolean;
}

@Injectable()
export class HealthDashboardService {
  private readonly alertThresholds = {
    dbPoolUtilization: 80,
    dbPoolCritical: 90,
    longestQuery: 30000, // 30 seconds
    lockWaits: 10,
    memoryUsage: 80,
  };

  constructor(
    private healthAggregator: HealthAggregatorService,
    private readinessService: SystemReadinessService,
    private dbPoolLogger: DbPoolLogger,
    private schemaControlPlaneService: SchemaControlPlaneService,
    private featureStatusService: FeatureStatusService,
    private pushService: PushNotificationService,
  ) {}

  async getHealthDashboard(): Promise<HealthDashboard> {
    const timestamp = new Date().toISOString();
    const readinessState = this.readinessService.getReadinessState();
    const dbMetrics = await this.dbPoolLogger.getDatabaseMetrics();
    const schemaStatus = await this.schemaControlPlaneService.getSchemaStatus();
    const featureReport = await this.featureStatusService.generateFeatureReport();

    // Calculate overall system health
    const overallHealth = this.calculateOverallHealth(dbMetrics, schemaStatus, featureReport);

    // Generate component statuses
    const componentStatus = this.generateComponentStatuses(
      dbMetrics,
      schemaStatus,
      featureReport,
      readinessState,
      timestamp,
    );

    // Generate alerts
    const alerts = this.generateAlerts(dbMetrics, schemaStatus, featureReport);

    // Generate recommendations
    const recommendations = this.generateRecommendations(dbMetrics, schemaStatus, featureReport);

    return {
      timestamp,
      systemOverview: {
        overallHealth,
        systemReady: readinessState.isReady,
        uptime: process.uptime(),
        version: process.version,
      },
      componentStatus,
      performanceMetrics: {
        database: dbMetrics,
        system: {
          memory: process.memoryUsage(),
          cpu: process.cpuUsage(),
          uptime: process.uptime(),
          version: process.version,
          platform: process.platform,
        },
      },
      alerts,
      recommendations,
    };
  }

  private calculateOverallHealth(
    dbMetrics: DatabaseMetrics,
    schemaStatus: any,
    featureReport: any,
  ): 'HEALTHY' | 'WARNING' | 'CRITICAL' {
    // Critical conditions
    if (!schemaStatus.connected || schemaStatus.driftDetected) {
      return 'CRITICAL';
    }

    if (dbMetrics.health.overallHealth === 'CRITICAL') {
      return 'CRITICAL';
    }

    // Warning conditions
    if (
      dbMetrics.health.overallHealth === 'WARNING' ||
      featureReport.redis !== 'ENABLED' ||
      featureReport.outbox !== 'ENABLED'
    ) {
      return 'WARNING';
    }

    return 'HEALTHY';
  }

  private generateComponentStatuses(
    dbMetrics: DatabaseMetrics,
    schemaStatus: any,
    featureReport: any,
    readinessState: any,
    timestamp: string,
  ): {
    database: ComponentHealth;
    schema: ComponentHealth;
    redis: ComponentHealth;
    realtime: ComponentHealth;
    push: ComponentHealth;
    outbox: ComponentHealth;
    system: ComponentHealth;
  } {
    return {
      database: {
        status: dbMetrics.health.overallHealth === 'HEALTHY' ? 'HEALTHY' : 'WARNING',
        message: dbMetrics.health.overallHealth === 'HEALTHY' 
          ? 'Database connection healthy' 
          : 'Database performance issues detected',
        lastCheck: timestamp,
        dependencies: [],
      },
      schema: {
        status: schemaStatus.driftDetected ? 'WARNING' : 'HEALTHY',
        message: schemaStatus.driftDetected 
          ? 'Schema drift detected - manual intervention required' 
          : 'Schema in sync',
        lastCheck: timestamp,
        dependencies: ['database'],
      },
      redis: {
        status: featureReport.redis === 'ENABLED' ? 'HEALTHY' : 'DISABLED',
        message: featureReport.redis === 'ENABLED' 
          ? 'Redis cache operational' 
          : 'Redis disabled - degraded performance',
        lastCheck: timestamp,
        dependencies: ['database'],
      },
      realtime: {
        status: featureReport.realtime === 'ENABLED' ? 'HEALTHY' : 'DISABLED',
        message: featureReport.realtime === 'ENABLED' 
          ? 'Real-time notifications active' 
          : 'Real-time features disabled',
        lastCheck: timestamp,
        dependencies: ['redis'],
      },
      push: {
        status: this.pushService.isEnabled() ? 'HEALTHY' : 'DISABLED',
        message: this.pushService.isEnabled() 
          ? 'Push notifications enabled' 
          : 'Push notifications disabled',
        lastCheck: timestamp,
        dependencies: ['redis'],
      },
      outbox: {
        status: featureReport.outbox === 'ENABLED' ? 'HEALTHY' : 'DISABLED',
        message: featureReport.outbox === 'ENABLED' 
          ? 'Outbox pattern active' 
          : 'Outbox disabled - events may be lost',
        lastCheck: timestamp,
        dependencies: ['database'],
      },
      system: {
        status: readinessState.isReady ? 'HEALTHY' : 'STARTING',
        message: readinessState.isReady 
          ? 'System fully operational' 
          : 'System starting up',
        lastCheck: timestamp,
        dependencies: ['database', 'schema'],
      },
    };
  }

  private generateAlerts(
    dbMetrics: DatabaseMetrics,
    schemaStatus: any,
    featureReport: any,
  ): Alert[] {
    const alerts: Alert[] = [];
    const now = new Date().toISOString();

    // Database alerts
    if (dbMetrics.connectionPool.utilization > this.alertThresholds.dbPoolCritical) {
      alerts.push({
        id: 'db-pool-critical',
        severity: 'CRITICAL',
        title: 'Database Pool Critical',
        message: `Database connection pool at ${dbMetrics.connectionPool.utilization.toFixed(1)}% capacity`,
        timestamp: now,
        acknowledged: false,
      });
    } else if (dbMetrics.connectionPool.utilization > this.alertThresholds.dbPoolUtilization) {
      alerts.push({
        id: 'db-pool-warning',
        severity: 'WARNING',
        title: 'Database Pool Warning',
        message: `Database connection pool at ${dbMetrics.connectionPool.utilization.toFixed(1)}% capacity`,
        timestamp: now,
        acknowledged: false,
      });
    }

    if (dbMetrics.performance.longestRunningQuery > this.alertThresholds.longestQuery) {
      alerts.push({
        id: 'slow-query',
        severity: 'WARNING',
        title: 'Slow Query Detected',
        message: `Query running for ${Math.floor(dbMetrics.performance.longestRunningQuery / 1000)} seconds`,
        timestamp: now,
        acknowledged: false,
      });
    }

    if (dbMetrics.performance.lockWaits > this.alertThresholds.lockWaits) {
      alerts.push({
        id: 'lock-waits',
        severity: 'WARNING',
        title: 'High Lock Contention',
        message: `${dbMetrics.performance.lockWaits} queries waiting for locks`,
        timestamp: now,
        acknowledged: false,
      });
    }

    // Schema alerts
    if (schemaStatus.driftDetected) {
      alerts.push({
        id: 'schema-drift',
        severity: 'CRITICAL',
        title: 'Schema Drift Detected',
        message: 'Database schema does not match application expectations',
        timestamp: now,
        acknowledged: false,
      });
    }

    // Feature alerts
    if (featureReport.redis !== 'ENABLED') {
      alerts.push({
        id: 'redis-disabled',
        severity: 'WARNING',
        title: 'Redis Disabled',
        message: 'Redis cache is disabled - system performance may be degraded',
        timestamp: now,
        acknowledged: false,
      });
    }

    if (featureReport.outbox !== 'ENABLED') {
      alerts.push({
        id: 'outbox-disabled',
        severity: 'WARNING',
        title: 'Outbox Disabled',
        message: 'Outbox pattern is disabled - domain events may not be processed',
        timestamp: now,
        acknowledged: false,
      });
    }

    return alerts;
  }

  private generateRecommendations(
    dbMetrics: DatabaseMetrics,
    schemaStatus: any,
    featureReport: any,
  ): string[] {
    const recommendations: string[] = [];

    if (dbMetrics.connectionPool.utilization > this.alertThresholds.dbPoolUtilization) {
      recommendations.push(
        'Consider increasing database connection pool size or optimizing queries to reduce connection usage',
      );
    }

    if (dbMetrics.performance.longestRunningQuery > this.alertThresholds.longestQuery) {
      recommendations.push(
        'Review slow queries and consider adding indexes or query optimization',
      );
    }

    if (dbMetrics.performance.lockWaits > this.alertThresholds.lockWaits) {
      recommendations.push(
        'Investigate lock contention - consider query optimization or transaction restructuring',
      );
    }

    if (schemaStatus.driftDetected) {
      recommendations.push(
        'Run schema migration to resolve drift - ensure all services are updated',
      );
    }

    if (featureReport.redis !== 'ENABLED') {
      recommendations.push(
        'Enable Redis cache to improve system performance and enable realtime features',
      );
    }

    if (featureReport.outbox !== 'ENABLED') {
      recommendations.push(
        'Enable outbox pattern for reliable domain event processing',
      );
    }

    if (recommendations.length === 0) {
      recommendations.push('System is operating within normal parameters');
    }

    return recommendations;
  }
}