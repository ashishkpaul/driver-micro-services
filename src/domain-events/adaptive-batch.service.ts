import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { IdempotencyTracker } from './idempotency-tracker.entity';
import { MetricsService } from './metrics.service';
import { OutboxStatus } from './outbox-status.enum';

@Injectable()
export class AdaptiveBatchService {
  private readonly logger = new Logger(AdaptiveBatchService.name);
  
  // Configuration
  private readonly MIN_BATCH_SIZE = 10;
  private readonly MAX_BATCH_SIZE = 100;
  private readonly DEFAULT_BATCH_SIZE = 50;
  private readonly ADJUSTMENT_FACTOR = 0.1; // 10% adjustment per cycle
  private readonly HISTORY_WINDOW_HOURS = 1; // Look back 1 hour for metrics
  private readonly TARGET_SUCCESS_RATE = 0.95; // Target 95% success rate
  private readonly TARGET_AVG_DURATION = 5000; // Target 5 seconds average processing time

  // Current adaptive settings
  private currentBatchSize = this.DEFAULT_BATCH_SIZE;
  private lastAdjustmentTime = Date.now();

  constructor(
    @InjectRepository(IdempotencyTracker)
    private idempotencyTrackerRepository: Repository<IdempotencyTracker>,
    private metricsService: MetricsService,
  ) {}

  /**
   * Get the optimal batch size based on current system conditions
   */
  async getOptimalBatchSize(): Promise<number> {
    const now = Date.now();
    
    // Only adjust every 5 minutes to avoid rapid fluctuations
    if (now - this.lastAdjustmentTime < 5 * 60 * 1000) {
      return this.currentBatchSize;
    }

    try {
      const optimalSize = await this.calculateOptimalBatchSize();
      this.currentBatchSize = optimalSize;
      this.lastAdjustmentTime = now;
      
      this.logger.debug(`Adaptive batch size adjusted: ${optimalSize}`);
      return optimalSize;
    } catch (error) {
      this.logger.error('Failed to calculate optimal batch size, using current:', error);
      return this.currentBatchSize;
    }
  }

  /**
   * Calculate optimal batch size based on historical performance
   */
  private async calculateOptimalBatchSize(): Promise<number> {
    const cutoffTime = new Date(Date.now() - this.HISTORY_WINDOW_HOURS * 60 * 60 * 1000);
    
    // Get recent processing statistics
    const recentStats = await this.idempotencyTrackerRepository
      .createQueryBuilder('tracker')
      .select([
        'COUNT(*) as totalEvents',
        'COUNT(CASE WHEN tracker.status = :completedStatus THEN 1 END) as completedEvents',
        'COUNT(CASE WHEN tracker.status = :failedStatus THEN 1 END) as failedEvents',
        'AVG(tracker.processing_duration_ms) as avgDuration',
        'MAX(tracker.processing_duration_ms) as maxDuration',
        'MIN(tracker.processing_duration_ms) as minDuration',
        'STDDEV(tracker.processing_duration_ms) as durationStdDev'
      ])
      .where('tracker.createdAt >= :cutoffTime', { cutoffTime })
      .andWhere('tracker.status IN (:...statuses)', { 
        statuses: ['COMPLETED', 'FAILED'] 
      })
      .getRawOne();

    const totalEvents = parseInt(recentStats?.totalEvents || '0', 10);
    
    if (totalEvents < 10) {
      // Not enough data, use default
      this.logger.debug('Insufficient data for batch size calculation, using default');
      return this.DEFAULT_BATCH_SIZE;
    }

    const completedEvents = parseInt(recentStats?.completedEvents || '0', 10);
    const failedEvents = parseInt(recentStats?.failedEvents || '0', 10);
    const avgDuration = parseFloat(recentStats?.avgDuration || '0');
    const maxDuration = parseFloat(recentStats?.maxDuration || '0');
    const minDuration = parseFloat(recentStats?.minDuration || '0');
    const durationStdDev = parseFloat(recentStats?.durationStdDev || '0');

    // Calculate success rate
    const successRate = totalEvents > 0 ? completedEvents / totalEvents : 0;

    // Calculate current system load indicators
    const systemLoad = this.calculateSystemLoad(successRate, avgDuration, maxDuration, durationStdDev);
    
    // Adjust batch size based on performance metrics
    let adjustment = 0;

    // Factor 1: Success rate adjustment
    if (successRate < this.TARGET_SUCCESS_RATE) {
      adjustment -= (this.TARGET_SUCCESS_RATE - successRate) * 2;
    } else if (successRate > 0.99) {
      adjustment += 0.1; // Small increase if consistently successful
    }

    // Factor 2: Processing time adjustment
    if (avgDuration > this.TARGET_AVG_DURATION) {
      adjustment -= (avgDuration - this.TARGET_AVG_DURATION) / this.TARGET_AVG_DURATION;
    } else if (avgDuration < this.TARGET_AVG_DURATION * 0.5) {
      adjustment += 0.2; // Small increase if processing is very fast
    }

    // Factor 3: System load adjustment
    if (systemLoad > 0.8) {
      adjustment -= 0.3; // Reduce batch size if system is overloaded
    } else if (systemLoad < 0.3) {
      adjustment += 0.2; // Increase batch size if system is underutilized
    }

    // Apply adjustment
    const newBatchSize = Math.round(this.currentBatchSize * (1 + adjustment * this.ADJUSTMENT_FACTOR));

    // Clamp to min/max bounds
    const clampedSize = Math.max(
      this.MIN_BATCH_SIZE, 
      Math.min(this.MAX_BATCH_SIZE, newBatchSize)
    );

    this.logger.log(
      `Batch size calculation: current=${this.currentBatchSize}, adjustment=${adjustment.toFixed(3)}, ` +
      `new=${newBatchSize}, clamped=${clampedSize}, ` +
      `successRate=${(successRate * 100).toFixed(1)}%, avgDuration=${avgDuration.toFixed(0)}ms, ` +
      `systemLoad=${(systemLoad * 100).toFixed(1)}%`
    );

    return clampedSize;
  }

  /**
   * Calculate system load based on multiple factors
   */
  private calculateSystemLoad(
    successRate: number, 
    avgDuration: number, 
    maxDuration: number, 
    durationStdDev: number
  ): number {
    // Normalize each factor to 0-1 scale
    const successRateLoad = 1 - successRate; // Lower success rate = higher load
    const durationLoad = Math.min(avgDuration / (this.TARGET_AVG_DURATION * 2), 1); // Higher duration = higher load
    const variabilityLoad = durationStdDev > 0 ? Math.min(durationStdDev / avgDuration, 1) : 0; // High variability = higher load

    // Weighted average
    const load = (successRateLoad * 0.4) + (durationLoad * 0.4) + (variabilityLoad * 0.2);
    
    return Math.max(0, Math.min(1, load));
  }

  /**
   * Track event processing for adaptive learning
   */
  async trackEventProcessing(
    idempotencyKey: string,
    eventType: string,
    payload: any,
    eventId: number,
    workerId: string,
    batchSize: number,
    processingDuration: number,
    status: 'COMPLETED' | 'FAILED',
    error?: string
  ): Promise<void> {
    try {
      // Calculate payload hash for debugging
      const payloadHash = this.calculatePayloadHash(payload);

      // Get system metrics at processing time
      const systemMetrics = await this.getSystemMetrics();

      const tracker = this.idempotencyTrackerRepository.create({
        idempotencyKey,
        eventType,
        payload,
        status,
        eventId,
        workerId,
        processingStart: new Date(Date.now() - processingDuration),
        processingEnd: new Date(),
        processingDurationMs: processingDuration,
        lastError: error,
        payloadHash,
        debugInfo: {
          batchSize,
          systemLoad: systemMetrics.loadAverage,
          memoryUsage: systemMetrics.memoryUsage,
          cpuUsage: systemMetrics.cpuUsage,
        },
        ...(status === 'COMPLETED' ? { completedAt: new Date() } : {}),
        ...(status === 'FAILED' ? { failedAt: new Date() } : {}),
      });

      await this.idempotencyTrackerRepository.save(tracker);
    } catch (error) {
      this.logger.error('Failed to track event processing:', error);
    }
  }

  /**
   * Get current system metrics
   */
  private async getSystemMetrics(): Promise<{
    loadAverage: number;
    memoryUsage: number;
    cpuUsage: number;
  }> {
    try {
      const os = require('os');
      
      // Load average (normalized to 0-1)
      const loadAvg = os.loadavg()[0];
      const cpuCount = os.cpus().length;
      const loadAverage = Math.min(loadAvg / cpuCount, 1);

      // Memory usage (normalized to 0-1)
      const totalMemory = os.totalmem();
      const freeMemory = os.freemem();
      const memoryUsage = 1 - (freeMemory / totalMemory);

      // CPU usage (simplified estimation)
      const cpuUsage = loadAverage; // Using load average as CPU usage proxy

      return { loadAverage, memoryUsage, cpuUsage };
    } catch (error) {
      this.logger.warn('Failed to get system metrics, using defaults:', error);
      return { loadAverage: 0.5, memoryUsage: 0.5, cpuUsage: 0.5 };
    }
  }

  /**
   * Calculate payload hash for debugging
   */
  private calculatePayloadHash(payload: any): string {
    try {
      const crypto = require('crypto');
      const payloadStr = JSON.stringify(payload, Object.keys(payload).sort());
      return crypto.createHash('sha256').update(payloadStr).digest('hex').substring(0, 16);
    } catch (error) {
      return 'hash_error';
    }
  }

  /**
   * Get batch size statistics for monitoring
   */
  async getBatchSizeStats(): Promise<{
    currentBatchSize: number;
    lastAdjustmentTime: Date;
    recentPerformance: {
      successRate: number;
      avgDuration: number;
      totalEvents: number;
    };
    systemLoad: number;
  }> {
    const cutoffTime = new Date(Date.now() - this.HISTORY_WINDOW_HOURS * 60 * 60 * 1000);
    
    const recentStats = await this.idempotencyTrackerRepository
      .createQueryBuilder('tracker')
      .select([
        'COUNT(*) as totalEvents',
        'COUNT(CASE WHEN tracker.status = :completedStatus THEN 1 END) as completedEvents',
        'AVG(tracker.processing_duration_ms) as avgDuration'
      ])
      .where('tracker.createdAt >= :cutoffTime', { cutoffTime })
      .andWhere('tracker.status IN (:...statuses)', { 
        statuses: ['COMPLETED', 'FAILED'] 
      })
      .getRawOne();

    const totalEvents = parseInt(recentStats?.totalEvents || '0', 10);
    const completedEvents = parseInt(recentStats?.completedEvents || '0', 10);
    const avgDuration = parseFloat(recentStats?.avgDuration || '0');
    const successRate = totalEvents > 0 ? completedEvents / totalEvents : 0;

    const systemMetrics = await this.getSystemMetrics();
    const systemLoad = this.calculateSystemLoad(successRate, avgDuration, avgDuration, 0);

    return {
      currentBatchSize: this.currentBatchSize,
      lastAdjustmentTime: new Date(this.lastAdjustmentTime),
      recentPerformance: {
        successRate,
        avgDuration,
        totalEvents,
      },
      systemLoad,
    };
  }

  /**
   * Reset batch size to default (for manual intervention)
   */
  resetBatchSize(): void {
    this.currentBatchSize = this.DEFAULT_BATCH_SIZE;
    this.lastAdjustmentTime = Date.now();
    this.logger.log('Batch size reset to default');
  }

  /**
   * Get current batch size without adjustment
   */
  getCurrentBatchSize(): number {
    return this.currentBatchSize;
  }
}