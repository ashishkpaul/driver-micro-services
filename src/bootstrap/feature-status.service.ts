import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class FeatureStatusService {
  private readonly logger = new Logger(FeatureStatusService.name);

  constructor(
    private readonly configService: ConfigService,
    @InjectDataSource() private readonly dataSource: DataSource,
  ) {}

  /**
   * Generate comprehensive feature status report
   */
  async generateFeatureReport(): Promise<{
    push: 'ENABLED' | 'DISABLED';
    redis: 'ENABLED' | 'DISABLED';
    realtime: 'ENABLED' | 'DISABLED';
    outbox: 'ENABLED' | 'DISABLED';
  }> {
    const report: {
      push: 'ENABLED' | 'DISABLED';
      redis: 'ENABLED' | 'DISABLED';
      realtime: 'ENABLED' | 'DISABLED';
      outbox: 'ENABLED' | 'DISABLED';
    } = {
      push: this.isPushEnabled() ? 'ENABLED' : 'DISABLED',
      redis: this.isRedisEnabled() ? 'ENABLED' : 'DISABLED',
      realtime: this.isRealtimeEnabled() ? 'ENABLED' : 'DISABLED',
      outbox: await this.isOutboxEnabled() ? 'ENABLED' : 'DISABLED',
    };

    this.logFeatureReport(report);
    return report;
  }

  /**
   * Check if Push notifications are enabled
   */
  private isPushEnabled(): boolean {
    const firebaseConfig = this.configService.get('FIREBASE_CONFIG');
    const firebaseServiceAccount = this.configService.get('FIREBASE_SERVICE_ACCOUNT');
    
    return !!(firebaseConfig || firebaseServiceAccount);
  }

  /**
   * Check if Redis is enabled
   */
  private isRedisEnabled(): boolean {
    const redisUrl = this.configService.get('REDIS_URL');
    const redisHost = this.configService.get('REDIS_HOST');
    
    return !!(redisUrl || redisHost);
  }

  /**
   * Check if Realtime (WebSocket) is enabled
   */
  private isRealtimeEnabled(): boolean {
    // Check if WebSocket is configured and enabled
    const websocketPort = this.configService.get('WEBSOCKET_PORT');
    const corsOrigins = this.configService.get('CORS_ORIGINS');
    
    // If WebSocket port is set, assume it's enabled
    return !!(websocketPort && websocketPort !== '0');
  }

  /**
   * Check if Outbox is enabled
   */
  private async isOutboxEnabled(): Promise<boolean> {
    try {
      // Check if outbox table exists
      const result = await this.dataSource.query(`
        SELECT EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_schema = 'public'
            AND table_name = 'outbox'
        )
      `);
      
      return result[0]?.exists || false;
    } catch (error) {
      this.logger.warn('Failed to check outbox table existence:', error);
      return false;
    }
  }

  /**
   * Log feature status report
   */
  private logFeatureReport(report: {
    push: 'ENABLED' | 'DISABLED';
    redis: 'ENABLED' | 'DISABLED';
    realtime: 'ENABLED' | 'DISABLED';
    outbox: 'ENABLED' | 'DISABLED';
  }): void {
    this.logger.log('FEATURE STATUS');
    this.logger.log(`Push: ${report.push}`);
    this.logger.log(`Redis: ${report.redis}`);
    this.logger.log(`Realtime: ${report.realtime}`);
    this.logger.log(`Outbox: ${report.outbox}`);

    // Log specific reasons for disabled features
    if (report.push === 'DISABLED') {
      this.logger.warn('FEATURE DISABLED: Push Notifications');
      this.logger.warn('Reason: Missing Firebase config');
      this.logger.warn('Impact: Driver notifications unavailable');
    }

    if (report.redis === 'DISABLED') {
      this.logger.warn('FEATURE DISABLED: Redis');
      this.logger.warn('Reason: Missing Redis configuration');
      this.logger.warn('Impact: Caching and session storage unavailable');
    }

    if (report.realtime === 'DISABLED') {
      this.logger.warn('FEATURE DISABLED: Realtime');
      this.logger.warn('Reason: WebSocket not configured');
      this.logger.warn('Impact: Real-time updates unavailable');
    }

    if (report.outbox === 'DISABLED') {
      this.logger.warn('FEATURE DISABLED: Outbox');
      this.logger.warn('Reason: Outbox table not found');
      this.logger.warn('Impact: Event-driven processing unavailable');
    }
  }

  /**
   * Get detailed feature status with reasons
   */
  async getDetailedFeatureStatus(): Promise<{
    features: Array<{
      name: string;
      status: 'ENABLED' | 'DISABLED';
      reason?: string;
      impact?: string;
    }>;
    summary: {
      enabled: number;
      disabled: number;
      total: number;
    };
  }> {
    const pushEnabled = this.isPushEnabled();
    const redisEnabled = this.isRedisEnabled();
    const realtimeEnabled = this.isRealtimeEnabled();
    const outboxEnabled = await this.isOutboxEnabled();

    const features: Array<{
      name: string;
      status: 'ENABLED' | 'DISABLED';
      reason?: string;
      impact?: string;
    }> = [
      {
        name: 'Push Notifications',
        status: pushEnabled ? 'ENABLED' : 'DISABLED',
        reason: pushEnabled ? undefined : 'Missing Firebase configuration',
        impact: pushEnabled ? undefined : 'Driver notifications unavailable',
      },
      {
        name: 'Redis',
        status: redisEnabled ? 'ENABLED' : 'DISABLED',
        reason: redisEnabled ? undefined : 'Missing Redis configuration',
        impact: redisEnabled ? undefined : 'Caching and session storage unavailable',
      },
      {
        name: 'Realtime (WebSocket)',
        status: realtimeEnabled ? 'ENABLED' : 'DISABLED',
        reason: realtimeEnabled ? undefined : 'WebSocket not configured',
        impact: realtimeEnabled ? undefined : 'Real-time updates unavailable',
      },
      {
        name: 'Outbox',
        status: outboxEnabled ? 'ENABLED' : 'DISABLED',
        reason: outboxEnabled ? undefined : 'Outbox table not found',
        impact: outboxEnabled ? undefined : 'Event-driven processing unavailable',
      },
    ];

    const enabled = features.filter(f => f.status === 'ENABLED').length;
    const disabled = features.filter(f => f.status === 'DISABLED').length;

    return {
      features,
      summary: {
        enabled,
        disabled,
        total: features.length,
      },
    };
  }
}