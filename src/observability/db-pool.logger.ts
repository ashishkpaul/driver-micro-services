import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

@Injectable()
export class DbPoolLogger {
  private readonly logger = new Logger(DbPoolLogger.name);
  private readonly LOG_INTERVAL = 60000; // 60 seconds
  private logInterval?: NodeJS.Timeout;

  constructor(@InjectDataSource() private readonly dataSource: DataSource) {}

  /**
   * Start logging database pool metrics
   */
  startLogging(): void {
    this.logger.log('Starting database pool metrics logging');

    this.logInterval = setInterval(() => {
      this.logPoolMetrics();
    }, this.LOG_INTERVAL);

    // Log initial metrics
    this.logPoolMetrics();
  }

  /**
   * Stop logging database pool metrics
   */
  stopLogging(): void {
    if (this.logInterval) {
      clearInterval(this.logInterval);
      this.logInterval = undefined;
      this.logger.log('Stopped database pool metrics logging');
    }
  }

  /**
   * Log current database pool metrics
   */
  private async logPoolMetrics(): Promise<void> {
    try {
      // Get pool statistics
      const poolStats = await this.getPoolStats();
      
      this.logger.log('DB POOL STATUS');
      this.logger.log(`Pool size: ${poolStats.poolSize}`);
      this.logger.log(`Active connections: ${poolStats.activeConnections}`);
      this.logger.log(`Idle connections: ${poolStats.idleConnections}`);
      this.logger.log(`Waiting clients: ${poolStats.waitingClients}`);

      // Log connection health
      if (poolStats.waitingClients > 0) {
        this.logger.warn(`High connection demand: ${poolStats.waitingClients} clients waiting`);
      }

      if (poolStats.activeConnections / poolStats.poolSize > 0.8) {
        this.logger.warn(`High pool utilization: ${(poolStats.activeConnections / poolStats.poolSize * 100).toFixed(1)}%`);
      }

    } catch (error) {
      this.logger.error('Failed to log pool metrics:', error);
    }
  }

  /**
   * Get pool statistics from the database connection
   */
  private async getPoolStats(): Promise<{
    poolSize: number;
    activeConnections: number;
    idleConnections: number;
    waitingClients: number;
  }> {
    try {
      // Fallback: query PostgreSQL for connection stats
      const result = await this.dataSource.query(`
        SELECT 
          (SELECT count(*) FROM pg_stat_activity WHERE state = 'active') as active_connections,
          (SELECT setting::int FROM pg_settings WHERE name = 'max_connections') as max_connections
      `);

      const activeConnections = result[0]?.active_connections || 0;
      const maxConnections = result[0]?.max_connections || 100;

      return {
        poolSize: maxConnections,
        activeConnections,
        idleConnections: maxConnections - activeConnections,
        waitingClients: 0, // Cannot determine from query
      };

    } catch (error) {
      this.logger.warn('Could not retrieve pool stats, using defaults:', error.message);
      
      // Return default values
      return {
        poolSize: 10,
        activeConnections: 0,
        idleConnections: 10,
        waitingClients: 0,
      };
    }
  }

  /**
   * Get current pool status for health checks
   */
  async getPoolStatus(): Promise<{
    healthy: boolean;
    poolSize: number;
    activeConnections: number;
    utilization: number;
    waitingClients: number;
  }> {
    try {
      const stats = await this.getPoolStats();
      const utilization = stats.poolSize > 0 ? stats.activeConnections / stats.poolSize : 0;
      
      return {
        healthy: utilization < 0.9 && stats.waitingClients === 0,
        poolSize: stats.poolSize,
        activeConnections: stats.activeConnections,
        utilization: utilization * 100,
        waitingClients: stats.waitingClients,
      };
    } catch (error) {
      return {
        healthy: false,
        poolSize: 0,
        activeConnections: 0,
        utilization: 0,
        waitingClients: 0,
      };
    }
  }

  /**
   * Test database connection
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.dataSource.query('SELECT 1');
      return true;
    } catch (error) {
      this.logger.error('Database connection test failed:', error);
      return false;
    }
  }
}