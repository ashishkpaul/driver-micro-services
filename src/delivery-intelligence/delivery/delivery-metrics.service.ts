import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Not, IsNull, LessThan } from 'typeorm';
import { DeliveryMetrics } from './delivery-metrics.entity';
import { Delivery } from '../../deliveries/entities/delivery.entity';

@Injectable()
export class DeliveryMetricsService {
  private readonly logger = new Logger(DeliveryMetricsService.name);

  constructor(
    @InjectRepository(DeliveryMetrics)
    private deliveryMetricsRepository: Repository<DeliveryMetrics>,
  ) {}

  async ensureMetrics(deliveryId: string, sellerOrderId: string): Promise<DeliveryMetrics> {
    let metrics = await this.deliveryMetricsRepository.findOne({
      where: { deliveryId },
    });

    if (!metrics) {
      metrics = this.deliveryMetricsRepository.create({
        deliveryId,
        sellerOrderId,
      });
      metrics = await this.deliveryMetricsRepository.save(metrics);
      this.logger.log(`Created new metrics record for delivery ${deliveryId}`);
    }

    return metrics;
  }

  async recordAssignment(delivery: Delivery): Promise<void> {
    const metrics = await this.ensureMetrics(delivery.id, delivery.sellerOrderId);
    if (delivery.driverId) {
      metrics.driverId = delivery.driverId;
    }
    metrics.assignedAt = new Date();
    metrics.assignmentTimeSeconds = this.calculateTimeSeconds(
      delivery.createdAt,
      metrics.assignedAt,
    );
    await this.deliveryMetricsRepository.save(metrics);
    this.logger.log(`Recorded assignment for delivery ${delivery.id}`);
  }

  async recordPickup(delivery: Delivery): Promise<void> {
    const metrics = await this.ensureMetrics(delivery.id, delivery.sellerOrderId);
    metrics.pickedUpAt = new Date();
    metrics.pickupTimeSeconds = this.calculateTimeSeconds(
      metrics.assignedAt || delivery.createdAt,
      metrics.pickedUpAt,
    );
    await this.deliveryMetricsRepository.save(metrics);
    this.logger.log(`Recorded pickup for delivery ${delivery.id}`);
  }

  async recordDelivery(delivery: Delivery): Promise<void> {
    const metrics = await this.ensureMetrics(delivery.id, delivery.sellerOrderId);
    metrics.deliveredAt = new Date();
    metrics.inTransitTimeSeconds = this.calculateTimeSeconds(
      metrics.pickedUpAt || metrics.assignedAt || delivery.createdAt,
      metrics.deliveredAt,
    );
    metrics.totalTimeSeconds = this.calculateTimeSeconds(
      metrics.assignedAt || delivery.createdAt,
      metrics.deliveredAt,
    );
    await this.deliveryMetricsRepository.save(metrics);
    this.logger.log(`Recorded delivery for delivery ${delivery.id}`);
  }

  async recordFailure(delivery: Delivery): Promise<void> {
    const metrics = await this.ensureMetrics(delivery.id, delivery.sellerOrderId);
    metrics.failedAt = new Date();
    await this.deliveryMetricsRepository.save(metrics);
    this.logger.log(`Recorded failure for delivery ${delivery.id}`);
  }

  async recordCancellation(delivery: Delivery): Promise<void> {
    const metrics = await this.ensureMetrics(delivery.id, delivery.sellerOrderId);
    // For cancellations, we don't set a specific timestamp since it could happen at any stage
    await this.deliveryMetricsRepository.save(metrics);
    this.logger.log(`Recorded cancellation for delivery ${delivery.id}`);
  }

  async incrementReassignment(deliveryId: string): Promise<void> {
    const metrics = await this.ensureMetrics(deliveryId, ''); // sellerOrderId not needed for reassignment
    metrics.reassignmentCount += 1;
    await this.deliveryMetricsRepository.save(metrics);
    this.logger.log(`Incremented reassignment count for delivery ${deliveryId}`);
  }

  async getSummary(filters?: {
    driverId?: string;
    zoneId?: string;
    startDate?: Date;
    endDate?: Date;
  }): Promise<any> {
    const query = this.deliveryMetricsRepository.createQueryBuilder('metrics');

    if (filters?.driverId) {
      query.andWhere('metrics.driverId = :driverId', { driverId: filters.driverId });
    }

    if (filters?.zoneId) {
      query.andWhere('metrics.zoneId = :zoneId', { zoneId: filters.zoneId });
    }

    if (filters?.startDate) {
      query.andWhere('metrics.createdAt >= :startDate', { startDate: filters.startDate });
    }

    if (filters?.endDate) {
      query.andWhere('metrics.createdAt <= :endDate', { endDate: filters.endDate });
    }

    const totalDeliveries = await query.getCount();
    
    const completedDeliveries = await query
      .clone()
      .andWhere('metrics.deliveredAt IS NOT NULL')
      .getCount();

    const failedDeliveries = await query
      .clone()
      .andWhere('metrics.failedAt IS NOT NULL')
      .getCount();

    const avgDeliveryTime = await query
      .clone()
      .select('AVG(metrics.total_time_seconds)', 'avgTime')
      .getRawOne();

    return {
      totalDeliveries,
      completedDeliveries,
      failedDeliveries,
      avgDeliveryTimeSeconds: avgDeliveryTime?.avgTime || 0,
    };
  }

  async getByDeliveryId(deliveryId: string): Promise<DeliveryMetrics | null> {
    return this.deliveryMetricsRepository.findOne({
      where: { deliveryId },
    });
  }

  async getByDriverId(driverId: string): Promise<DeliveryMetrics[]> {
    return this.deliveryMetricsRepository.find({
      where: { driverId },
      order: { createdAt: 'DESC' },
    });
  }

  // Health service methods
  async getTotalDeliveries(): Promise<number> {
    return this.deliveryMetricsRepository.count();
  }

  async getCompletedDeliveries(): Promise<number> {
    return this.deliveryMetricsRepository.count({
      where: { deliveredAt: Not(IsNull()) },
    });
  }

  async getFailedDeliveries(): Promise<number> {
    return this.deliveryMetricsRepository.count({
      where: { failedAt: Not(IsNull()) },
    });
  }

  async getInTransitDeliveries(): Promise<number> {
    return this.deliveryMetricsRepository.count({
      where: {
        pickedUpAt: Not(IsNull()),
        deliveredAt: IsNull(),
        failedAt: IsNull(),
      },
    });
  }

  async getAverageDeliveryTime(): Promise<number> {
    const result = await this.deliveryMetricsRepository
      .createQueryBuilder('metrics')
      .select('AVG(metrics.total_time_seconds)', 'avgTime')
      .getRawOne();
    return result?.avgTime || 0;
  }

  async getStuckDeliveries(): Promise<DeliveryMetrics[]> {
    const stuckThreshold = new Date();
    stuckThreshold.setHours(stuckThreshold.getHours() - 2); // 2 hours ago

    return this.deliveryMetricsRepository.find({
      where: {
        pickedUpAt: LessThan(stuckThreshold),
        deliveredAt: IsNull(),
        failedAt: IsNull(),
      },
      relations: ['delivery'],
    });
  }

  private calculateTimeSeconds(startTime: Date, endTime: Date): number {
    if (!startTime || !endTime) {
      return 0;
    }
    return Math.round((endTime.getTime() - startTime.getTime()) / 1000);
  }
}