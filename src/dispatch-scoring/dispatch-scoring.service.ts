import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, DataSource, EntityManager } from "typeorm";
import { DriverStatsService } from "../delivery-intelligence/driver/driver-stats.service";
import { DeliveryMetricsService } from "../delivery-intelligence/delivery/delivery-metrics.service";
import { DispatchConfigService } from "./dispatch-config.service";
import { DispatchScore, ScoreType, ScoreSource } from "./entities/dispatch-score.entity";
import { DispatchConfig, ConfigType } from "./entities/dispatch-config.entity";
import { Driver } from "../drivers/entities/driver.entity";

@Injectable()
export class DispatchScoringService {
  private readonly logger = new Logger(DispatchScoringService.name);

  // Default scoring weights
  private readonly DEFAULT_WEIGHTS = {
    completionRate: 0.4,
    timing: 0.3,
    quality: 0.3,
  };

  // Default thresholds
  private readonly DEFAULT_THRESHOLDS = {
    minimumScore: 50,
    minimumAssignments: 5,
  };

  // Score decay settings (score multiplier per day since last activity)
  private readonly DEFAULT_DECAY = {
    baseDecay: 0.95,
    maxDecayDays: 30,
  };

  constructor(
    @InjectRepository(DispatchScore)
    private readonly dispatchScoreRepository: Repository<DispatchScore>,
    @InjectRepository(DispatchConfig)
    private readonly dispatchConfigRepository: Repository<DispatchConfig>,
    private readonly driverStatsService: DriverStatsService,
    private readonly deliveryMetricsService: DeliveryMetricsService,
    private readonly dispatchConfigService: DispatchConfigService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Calculate real-time dispatch score for a driver
   */
  async calculateDispatchScore(driverId: string): Promise<DispatchScore> {
    const driverStats = await this.driverStatsService.getStats(driverId);
    if (!driverStats) {
      throw new NotFoundException(`Driver stats not found for driver ${driverId}`);
    }

    // Get scoring weights from configuration
    const weights = await this.getScoringWeights(driverId);
    
    // Calculate individual component scores
    const completionRateScore = this.calculateCompletionRateScore(driverStats);
    const timingScore = this.calculateTimingScore(driverStats);
    const qualityScore = this.calculateQualityScore(driverStats);

    // Calculate weighted overall score
    const overallScore = this.calculateWeightedScore({
      completionRate: completionRateScore,
      timing: timingScore,
      quality: qualityScore,
    }, weights);

    // Apply score decay based on last activity
    const decayedScore = this.applyScoreDecay(overallScore, driverStats.lastDeliveryAt);

    // Create or update dispatch score
    const dispatchScore = await this.createOrUpdateDispatchScore(driverId, {
      overall: decayedScore,
      completionRate: completionRateScore,
      timing: timingScore,
      quality: qualityScore,
    });

    return dispatchScore;
  }

  /**
   * Calculate multi-factor score with detailed breakdown
   */
  async calculateMultiFactorScore(driverId: string): Promise<{
    overall: number;
    factors: {
      completionRate: { score: number; weight: number };
      timing: { score: number; weight: number };
      quality: { score: number; weight: number };
    };
    metadata: Record<string, any>;
  }> {
    const driverStats = await this.driverStatsService.getStats(driverId);
    if (!driverStats) {
      throw new NotFoundException(`Driver stats not found for driver ${driverId}`);
    }

    const weights = await this.getScoringWeights(driverId);
    
    const completionRateScore = this.calculateCompletionRateScore(driverStats);
    const timingScore = this.calculateTimingScore(driverStats);
    const qualityScore = this.calculateQualityScore(driverStats);

    const overallScore = this.calculateWeightedScore({
      completionRate: completionRateScore,
      timing: timingScore,
      quality: qualityScore,
    }, weights);

    const decayedScore = this.applyScoreDecay(overallScore, driverStats.lastDeliveryAt);

    return {
      overall: decayedScore,
      factors: {
        completionRate: {
          score: completionRateScore,
          weight: weights.completionRate,
        },
        timing: {
          score: timingScore,
          weight: weights.timing,
        },
        quality: {
          score: qualityScore,
          weight: weights.quality,
        },
      },
      metadata: {
        rawScores: {
          completionRate: completionRateScore,
          timing: timingScore,
          quality: qualityScore,
        },
        weights,
        decayApplied: overallScore !== decayedScore,
        lastActivity: driverStats.lastDeliveryAt,
      },
    };
  }

  /**
   * Check if driver meets minimum thresholds for dispatch
   */
  async isDriverEligible(driverId: string): Promise<boolean> {
    try {
      const driverStats = await this.driverStatsService.getStats(driverId);
      if (!driverStats) {
        return false;
      }

      const thresholds = await this.getThresholds(driverId);
      
      // Check minimum assignments threshold
      const totalAssignments = driverStats.acceptanceCount + driverStats.failedDeliveries + driverStats.cancelledDeliveries;
      if (totalAssignments < thresholds.minimumAssignments) {
        this.logger.debug(`Driver ${driverId} below minimum assignments: ${totalAssignments} < ${thresholds.minimumAssignments}`);
        return false;
      }

      // Check minimum score threshold
      const currentScore = await this.getCurrentScore(driverId);
      if (currentScore < thresholds.minimumScore) {
        this.logger.debug(`Driver ${driverId} below minimum score: ${currentScore} < ${thresholds.minimumScore}`);
        return false;
      }

      return true;
    } catch (error) {
      this.logger.error(`Error checking driver eligibility for ${driverId}:`, error);
      return false;
    }
  }

  /**
   * Get current dispatch score for a driver
   */
  async getCurrentScore(driverId: string): Promise<number> {
    const score = await this.dispatchScoreRepository.findOne({
      where: {
        driverId,
        scoreType: ScoreType.OVERALL,
      },
      order: { lastCalculatedAt: "DESC" },
    });

    if (!score) {
      // Calculate score if it doesn't exist
      const newScore = await this.calculateDispatchScore(driverId);
      return newScore.score;
    }

    // Check if score is still valid
    if (score.validUntil < new Date()) {
      // Recalculate expired score
      const newScore = await this.calculateDispatchScore(driverId);
      return newScore.score;
    }

    return score.score;
  }

  /**
   * Get top N drivers by score for a given criteria
   */
  async getTopDrivers(criteria: {
    limit?: number;
    minScore?: number;
    maxDistance?: number;
    lat?: number;
    lon?: number;
  }): Promise<Array<{ driverId: string; score: number }>> {
    const {
      limit = 10,
      minScore = 50,
      maxDistance,
      lat,
      lon,
    } = criteria;

    // Build query to get top drivers by score
    const query = this.dispatchScoreRepository
      .createQueryBuilder("score")
      .where("score.scoreType = :scoreType", { scoreType: ScoreType.OVERALL })
      .andWhere("score.score >= :minScore", { minScore })
      .andWhere("score.validUntil > :now", { now: new Date() })
      .orderBy("score.score", "DESC")
      .addOrderBy("score.lastCalculatedAt", "DESC")
      .limit(limit);

    const results = await query.getMany();

    return results.map(result => ({
      driverId: result.driverId,
      score: result.score,
    }));
  }

  // Private helper methods

  private async getScoringWeights(driverId: string): Promise<typeof this.DEFAULT_WEIGHTS> {
    try {
      const config = await this.dispatchConfigService.getConfig(ConfigType.SCORING_WEIGHTS, driverId);
      return {
        completionRate: config?.completionRate || this.DEFAULT_WEIGHTS.completionRate,
        timing: config?.timing || this.DEFAULT_WEIGHTS.timing,
        quality: config?.quality || this.DEFAULT_WEIGHTS.quality,
      };
    } catch (error) {
      this.logger.warn(`Failed to get scoring weights for driver ${driverId}, using defaults:`, error);
      return this.DEFAULT_WEIGHTS;
    }
  }

  private async getThresholds(driverId: string): Promise<typeof this.DEFAULT_THRESHOLDS> {
    try {
      const config = await this.dispatchConfigService.getConfig(ConfigType.THRESHOLDS, driverId);
      return {
        minimumScore: config?.minimumScore || this.DEFAULT_THRESHOLDS.minimumScore,
        minimumAssignments: config?.minimumAssignments || this.DEFAULT_THRESHOLDS.minimumAssignments,
      };
    } catch (error) {
      this.logger.warn(`Failed to get thresholds for driver ${driverId}, using defaults:`, error);
      return this.DEFAULT_THRESHOLDS;
    }
  }

  private calculateCompletionRateScore(driverStats: any): number {
    const totalAssignments = driverStats.acceptanceCount;
    const successfulDeliveries = driverStats.completedDeliveries;
    
    if (totalAssignments === 0) {
      return 50; // Neutral score for new drivers
    }

    const completionRate = successfulDeliveries / totalAssignments;
    return Math.min(100, Math.max(0, completionRate * 100));
  }

  private calculateTimingScore(driverStats: any): number {
    const avgPickupTime = driverStats.avgPickupTimeSeconds;
    const avgTotalTime = driverStats.avgDeliveryTimeSeconds;
    
    if (!avgPickupTime || !avgTotalTime) {
      return 70; // Default score if timing data unavailable
    }

    // Normalize timing scores (lower is better)
    const pickupScore = Math.max(0, 100 - (avgPickupTime / 60) * 5); // Penalize slow pickup
    const totalTimeScore = Math.max(0, 100 - (avgTotalTime / 3600) * 10); // Penalize slow delivery

    return (pickupScore + totalTimeScore) / 2;
  }

  private calculateQualityScore(driverStats: any): number {
    const totalAssignments = driverStats.acceptanceCount;
    const failedDeliveries = driverStats.failedDeliveries;
    const cancelledDeliveries = driverStats.cancelledDeliveries;
    
    if (totalAssignments === 0) {
      return 80; // Default score for new drivers
    }

    const qualityRate = 1 - ((failedDeliveries + cancelledDeliveries) / totalAssignments);
    return Math.min(100, Math.max(0, qualityRate * 100));
  }

  private calculateWeightedScore(scores: {
    completionRate: number;
    timing: number;
    quality: number;
  }, weights: typeof this.DEFAULT_WEIGHTS): number {
    const weightedSum = 
      scores.completionRate * weights.completionRate +
      scores.timing * weights.timing +
      scores.quality * weights.quality;

    return Math.round(weightedSum * 100) / 100; // Round to 2 decimal places
  }

  private applyScoreDecay(score: number, lastActivity: Date): number {
    if (!lastActivity) {
      return score;
    }

    const daysSinceActivity = Math.floor((new Date().getTime() - lastActivity.getTime()) / (1000 * 60 * 60 * 24));
    
    if (daysSinceActivity <= 0) {
      return score;
    }

    const decaySettings = this.DEFAULT_DECAY;
    const decayDays = Math.min(daysSinceActivity, decaySettings.maxDecayDays);
    const decayMultiplier = Math.pow(decaySettings.baseDecay, decayDays);

    return Math.max(0, Math.round(score * decayMultiplier * 100) / 100);
  }

  private async createOrUpdateDispatchScore(
    driverId: string,
    scores: {
      overall: number;
      completionRate: number;
      timing: number;
      quality: number;
    }
  ): Promise<DispatchScore> {
    const now = new Date();
    const validUntil = new Date(now.getTime() + 60 * 60 * 1000); // Valid for 1 hour

    // Check if score exists and is still valid
    let existingScore = await this.dispatchScoreRepository.findOne({
      where: {
        driverId,
        scoreType: ScoreType.OVERALL,
      },
      order: { lastCalculatedAt: "DESC" },
    });

    if (existingScore && existingScore.validUntil > now) {
      // Update existing score
      existingScore.score = scores.overall;
      existingScore.lastCalculatedAt = now;
      existingScore.validUntil = validUntil;
      existingScore.metadata = {
        completionRate: scores.completionRate,
        timing: scores.timing,
        quality: scores.quality,
      };
      return await this.dispatchScoreRepository.save(existingScore);
    }

    // Create new score
    const dispatchScore = this.dispatchScoreRepository.create({
      driverId,
      scoreType: ScoreType.OVERALL,
      score: scores.overall,
      scoreSource: ScoreSource.DRIVER_STATS,
      weightFactor: 1.0,
      decayFactor: 1.0,
      lastCalculatedAt: now,
      validUntil,
      metadata: {
        completionRate: scores.completionRate,
        timing: scores.timing,
        quality: scores.quality,
      },
    });

    return await this.dispatchScoreRepository.save(dispatchScore);
  }
}
