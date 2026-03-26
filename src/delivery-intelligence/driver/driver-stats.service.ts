import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { DriverStats } from './driver-stats.entity';

@Injectable()
export class DriverStatsService {
  private readonly logger = new Logger(DriverStatsService.name);

  constructor(
    @InjectRepository(DriverStats)
    private driverStatsRepository: Repository<DriverStats>,
  ) {}

  async ensureStats(driverId: string): Promise<DriverStats> {
    let stats = await this.driverStatsRepository.findOne({
      where: { driverId },
    });

    if (!stats) {
      stats = this.driverStatsRepository.create({
        driverId,
      });
      stats = await this.driverStatsRepository.save(stats);
      this.logger.log(`Created new stats record for driver ${driverId}`);
    }

    return stats;
  }

  async getStats(driverId: string): Promise<DriverStats | null> {
    return this.driverStatsRepository.findOne({
      where: { driverId },
    });
  }

  async recordAssignmentAccepted(driverId: string): Promise<void> {
    const stats = await this.ensureStats(driverId);
    stats.acceptanceCount += 1;
    stats.totalDeliveries += 1;
    await this.driverStatsRepository.save(stats);
    this.logger.log(`Recorded assignment acceptance for driver ${driverId}`);
  }

  async recordAssignmentRejected(driverId: string): Promise<void> {
    const stats = await this.ensureStats(driverId);
    stats.rejectionCount += 1;
    await this.driverStatsRepository.save(stats);
    this.logger.log(`Recorded assignment rejection for driver ${driverId}`);
  }

  async recordDeliveryCompleted(
    driverId: string,
    input: {
      pickupTimeSeconds?: number;
      totalTimeSeconds?: number;
      deliveredAt?: Date;
    },
  ): Promise<void> {
    const stats = await this.ensureStats(driverId);
    stats.completedDeliveries += 1;
    stats.lastDeliveryAt = input.deliveredAt || new Date();

    // Update average times
    if (input.pickupTimeSeconds !== undefined) {
      const currentTotalPickupTime = stats.avgPickupTimeSeconds * (stats.completedDeliveries - 1);
      stats.avgPickupTimeSeconds = Math.round(
        (currentTotalPickupTime + input.pickupTimeSeconds) / stats.completedDeliveries,
      );
    }

    if (input.totalTimeSeconds !== undefined) {
      const currentTotalDeliveryTime = stats.avgDeliveryTimeSeconds * (stats.completedDeliveries - 1);
      stats.avgDeliveryTimeSeconds = Math.round(
        (currentTotalDeliveryTime + input.totalTimeSeconds) / stats.completedDeliveries,
      );
    }

    await this.recomputeReliabilityScore(stats);
    await this.driverStatsRepository.save(stats);
    this.logger.log(`Recorded delivery completion for driver ${driverId}`);
  }

  async recordDeliveryFailed(driverId: string): Promise<void> {
    const stats = await this.ensureStats(driverId);
    stats.failedDeliveries += 1;
    await this.recomputeReliabilityScore(stats);
    await this.driverStatsRepository.save(stats);
    this.logger.log(`Recorded delivery failure for driver ${driverId}`);
  }

  async recordDeliveryCancelled(driverId: string): Promise<void> {
    const stats = await this.ensureStats(driverId);
    stats.cancelledDeliveries += 1;
    await this.recomputeReliabilityScore(stats);
    await this.driverStatsRepository.save(stats);
    this.logger.log(`Recorded delivery cancellation for driver ${driverId}`);
  }

  private async recomputeReliabilityScore(stats: DriverStats): Promise<void> {
    const totalAttempts = stats.totalDeliveries;
    if (totalAttempts === 0) {
      stats.reliabilityScore = 0;
      return;
    }

    const successRate = stats.completedDeliveries / totalAttempts;
    const failureRate = stats.failedDeliveries / totalAttempts;
    const cancellationRate = stats.cancelledDeliveries / totalAttempts;

    // Simple reliability score calculation (0-100)
    // Higher completion rate = higher score
    // Higher failure/cancellation rate = lower score
    let score = successRate * 100;
    score -= failureRate * 50; // Penalize failures more heavily
    score -= cancellationRate * 30; // Penalize cancellations

    // Ensure score is between 0 and 100
    stats.reliabilityScore = Math.max(0, Math.min(100, score));
  }
}