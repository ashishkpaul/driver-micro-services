import { Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { OutboxEvent } from "./outbox.entity";
import { OutboxStatus } from "./outbox-status.enum";

// If prom-client is not installed, we'll create a simple metrics implementation
// that can be easily replaced with Prometheus when needed
interface MetricValue {
  value: number;
  timestamp: Date;
}

interface GaugeMetric {
  name: string;
  help: string;
  value: number;
}

interface HistogramMetric {
  name: string;
  help: string;
  buckets: number[];
  observations: number[];
  sum: number;
  count: number;
}

@Injectable()
export class MetricsService {
  private readonly logger = new Logger(MetricsService.name);

  // Simple in-memory metrics storage
  private gauges = new Map<string, GaugeMetric>();
  private histograms = new Map<string, HistogramMetric>();
  private counters = new Map<string, number>();

  constructor(
    @InjectRepository(OutboxEvent)
    private outboxRepository: Repository<OutboxEvent>,
  ) {
    // Initialize metrics
    this.initMetrics();
  }

  /**
   * Initialize all metrics with default values
   */
  private initMetrics(): void {
    // Gauge metrics
    this.gauges.set("outbox_pending_total", {
      name: "outbox_pending_total",
      help: "Number of pending outbox events",
      value: 0,
    });

    this.gauges.set("outbox_processing_total", {
      name: "outbox_processing_total",
      help: "Number of processing outbox events",
      value: 0,
    });

    this.gauges.set("outbox_failed_total", {
      name: "outbox_failed_total",
      help: "Number of failed outbox events",
      value: 0,
    });

    this.gauges.set("outbox_completed_total", {
      name: "outbox_completed_total",
      help: "Number of completed outbox events",
      value: 0,
    });

    // Histogram metrics
    this.histograms.set("outbox_lag_seconds", {
      name: "outbox_lag_seconds",
      help: "Lag between event creation and processing in seconds",
      buckets: [1, 5, 10, 30, 60, 300, 600, 1800, 3600],
      observations: [],
      sum: 0,
      count: 0,
    });

    this.histograms.set("outbox_processing_duration_seconds", {
      name: "outbox_processing_duration_seconds",
      help: "Time taken to process an outbox event in seconds",
      buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
      observations: [],
      sum: 0,
      count: 0,
    });

    this.histograms.set("outbox_retry_delay_seconds", {
      name: "outbox_retry_delay_seconds",
      help: "Delay between retries in seconds",
      buckets: [1, 5, 10, 30, 60, 300, 600],
      observations: [],
      sum: 0,
      count: 0,
    });

    // Counter metrics
    this.counters.set("outbox_events_processed_total", 0);
    this.counters.set("outbox_events_failed_total", 0);
    this.counters.set("outbox_events_retried_total", 0);
    this.counters.set("outbox_circuit_breaker_open_total", 0);
    this.counters.set("outbox_circuit_breaker_half_open_total", 0);
    this.counters.set("outbox_circuit_breaker_closed_total", 0);
  }

  /**
   * Update all metrics from database
   */
  async updateMetrics(): Promise<void> {
    try {
      // Update gauge metrics
      const [pendingCount, processingCount, failedCount, completedCount] =
        await Promise.all([
          this.outboxRepository.count({
            where: { status: OutboxStatus.PENDING },
          }),
          this.outboxRepository.count({
            where: { status: OutboxStatus.PROCESSING },
          }),
          this.outboxRepository.count({
            where: { status: OutboxStatus.FAILED },
          }),
          this.outboxRepository.count({
            where: { status: OutboxStatus.COMPLETED },
          }),
        ]);

      this.setGauge("outbox_pending_total", pendingCount);
      this.setGauge("outbox_processing_total", processingCount);
      this.setGauge("outbox_failed_total", failedCount);
      this.setGauge("outbox_completed_total", completedCount);

      // Update lag histogram
      await this.updateLagHistogram();

      this.logger.debug("Metrics updated successfully");
    } catch (error) {
      this.logger.error("Failed to update metrics:", error);
    }
  }

  /**
   * Record processing duration for an event
   */
  recordProcessingDuration(durationSeconds: number): void {
    this.recordHistogram("outbox_processing_duration_seconds", durationSeconds);
  }

  /**
   * Record retry delay
   */
  recordRetryDelay(delaySeconds: number): void {
    this.recordHistogram("outbox_retry_delay_seconds", delaySeconds);
  }

  /**
   * Increment event processed counter
   */
  incrementEventsProcessed(): void {
    this.incrementCounter("outbox_events_processed_total");
  }

  /**
   * Increment event failed counter
   */
  incrementEventsFailed(): void {
    this.incrementCounter("outbox_events_failed_total");
  }

  /**
   * Increment retry counter
   */
  incrementRetries(): void {
    this.incrementCounter("outbox_events_retried_total");
  }

  /**
   * Record circuit breaker state change
   */
  recordCircuitBreakerState(state: string): void {
    const counterName = `outbox_circuit_breaker_${state.toLowerCase()}_total`;
    this.incrementCounter(counterName);
  }

  /**
   * Get all metrics in Prometheus format
   */
  getMetrics(): string {
    let output = "";

    // Add gauge metrics
    for (const [name, gauge] of this.gauges.entries()) {
      output += `# HELP ${gauge.name} ${gauge.help}\n`;
      output += `# TYPE ${gauge.name} gauge\n`;
      output += `${gauge.name} ${gauge.value}\n\n`;
    }

    // Add histogram metrics
    for (const [name, histogram] of this.histograms.entries()) {
      output += `# HELP ${histogram.name} ${histogram.help}\n`;
      output += `# TYPE ${histogram.name} histogram\n`;

      // Add bucket observations
      const sortedBuckets = [...histogram.buckets].sort((a, b) => a - b);
      let cumulativeCount = 0;

      for (const bucket of sortedBuckets) {
        const bucketCount = histogram.observations.filter(
          (obs) => obs <= bucket,
        ).length;
        cumulativeCount += bucketCount;
        output += `${histogram.name}_bucket{le="${bucket}"} ${cumulativeCount}\n`;
      }

      // Add +Inf bucket
      output += `${histogram.name}_bucket{le="+Inf"} ${histogram.count}\n`;

      // Add sum and count
      output += `${histogram.name}_sum ${histogram.sum}\n`;
      output += `${histogram.name}_count ${histogram.count}\n\n`;
    }

    // Add counter metrics
    for (const [name, value] of this.counters.entries()) {
      output += `# HELP ${name} Total count of ${name}\n`;
      output += `# TYPE ${name} counter\n`;
      output += `${name} ${value}\n\n`;
    }

    return output;
  }

  /**
   * Get metrics summary for health checks
   */
  async getMetricsSummary(): Promise<{
    pending: number;
    processing: number;
    failed: number;
    completed: number;
    lagP95: number;
    lagP99: number;
    avgProcessingTime: number;
    totalProcessed: number;
    totalFailed: number;
    totalRetries: number;
  }> {
    await this.updateMetrics();

    const lagHistogram = this.histograms.get("outbox_lag_seconds")!;
    const processingHistogram = this.histograms.get(
      "outbox_processing_duration_seconds",
    )!;

    return {
      pending: this.getGaugeValue("outbox_pending_total"),
      processing: this.getGaugeValue("outbox_processing_total"),
      failed: this.getGaugeValue("outbox_failed_total"),
      completed: this.getGaugeValue("outbox_completed_total"),
      lagP95: this.calculatePercentile(lagHistogram, 95),
      lagP99: this.calculatePercentile(lagHistogram, 99),
      avgProcessingTime:
        processingHistogram.count > 0
          ? processingHistogram.sum / processingHistogram.count
          : 0,
      totalProcessed: this.getCounterValue("outbox_events_processed_total"),
      totalFailed: this.getCounterValue("outbox_events_failed_total"),
      totalRetries: this.getCounterValue("outbox_events_retried_total"),
    };
  }

  /**
   * Health check based on metrics
   */
  async checkHealth(): Promise<{
    isHealthy: boolean;
    issues: string[];
    summary: any;
  }> {
    const summary = await this.getMetricsSummary();
    const issues: string[] = [];

    // Check for high lag
    if (summary.lagP95 > 300) {
      // 5 minutes
      issues.push(`High lag detected: P95=${summary.lagP95}s`);
    }

    // Check for too many failed events
    if (summary.failed > 100) {
      issues.push(`Too many failed events: ${summary.failed}`);
    }

    // Check for processing backlog
    if (summary.pending > 1000) {
      issues.push(`Large processing backlog: ${summary.pending} events`);
    }

    // Check for high failure rate
    const totalEvents = summary.totalProcessed + summary.totalFailed;
    const failureRate = totalEvents > 0 ? summary.totalFailed / totalEvents : 0;
    if (failureRate > 0.1) {
      // 10% failure rate
      issues.push(`High failure rate: ${(failureRate * 100).toFixed(2)}%`);
    }

    return {
      isHealthy: issues.length === 0,
      issues,
      summary,
    };
  }

  // Private helper methods
  private setGauge(name: string, value: number): void {
    const gauge = this.gauges.get(name);
    if (gauge) {
      gauge.value = value;
    }
  }

  private getGaugeValue(name: string): number {
    const gauge = this.gauges.get(name);
    return gauge ? gauge.value : 0;
  }

  private incrementCounter(name: string): void {
    const current = this.counters.get(name) || 0;
    this.counters.set(name, current + 1);
  }

  private getCounterValue(name: string): number {
    return this.counters.get(name) || 0;
  }

  private recordHistogram(name: string, value: number): void {
    const histogram = this.histograms.get(name);
    if (histogram) {
      histogram.observations.push(value);
      histogram.sum += value;
      histogram.count++;
    }
  }

  private async updateLagHistogram(): Promise<void> {
    try {
      const pendingEvents = await this.outboxRepository
        .createQueryBuilder("e")
        .select("EXTRACT(EPOCH FROM (NOW() - e.createdAt))", "lag")
        .where("e.status = :status", { status: OutboxStatus.PENDING })
        .getRawMany();

      const histogram = this.histograms.get("outbox_lag_seconds")!;
      histogram.observations = []; // Reset for current snapshot
      histogram.sum = 0;
      histogram.count = 0;

      for (const event of pendingEvents) {
        const lag = parseFloat(event.lag);
        if (!isNaN(lag)) {
          histogram.observations.push(lag);
          histogram.sum += lag;
          histogram.count++;
        }
      }
    } catch (error) {
      this.logger.error("Failed to update lag histogram:", error);
    }
  }

  private calculatePercentile(
    histogram: HistogramMetric,
    percentile: number,
  ): number {
    if (histogram.observations.length === 0) return 0;

    const sorted = [...histogram.observations].sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
  }
}
