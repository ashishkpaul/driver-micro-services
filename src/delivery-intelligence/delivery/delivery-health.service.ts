import { Injectable, Logger } from '@nestjs/common';
import { DeliveryMetricsService } from './delivery-metrics.service';

@Injectable()
export class DeliveryHealthService {
  private readonly logger = new Logger(DeliveryHealthService.name);

  constructor(
    private readonly deliveryMetricsService: DeliveryMetricsService,
  ) {}

  async getSummary(): Promise<any> {
    const totalDeliveries = await this.deliveryMetricsService.getTotalDeliveries();
    const completedDeliveries = await this.deliveryMetricsService.getCompletedDeliveries();
    const failedDeliveries = await this.deliveryMetricsService.getFailedDeliveries();
    const inTransitDeliveries = await this.deliveryMetricsService.getInTransitDeliveries();
    const avgDeliveryTimeSeconds = await this.deliveryMetricsService.getAverageDeliveryTime();

    return {
      totalDeliveries,
      completedDeliveries,
      failedDeliveries,
      inTransitDeliveries,
      avgDeliveryTimeSeconds,
      successRate: totalDeliveries > 0 ? (completedDeliveries / totalDeliveries) * 100 : 0,
    };
  }

  async getStuckDeliveries(): Promise<any[]> {
    return this.deliveryMetricsService.getStuckDeliveries();
  }

  async getFailureRate(): Promise<any> {
    const totalDeliveries = await this.deliveryMetricsService.getTotalDeliveries();
    const failedDeliveries = await this.deliveryMetricsService.getFailedDeliveries();

    return {
      totalDeliveries,
      failedDeliveries,
      failureRate: totalDeliveries > 0 ? (failedDeliveries / totalDeliveries) * 100 : 0,
    };
  }
}