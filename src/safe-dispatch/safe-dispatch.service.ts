import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, DataSource } from "typeorm";
import { DispatchScoringService } from "../dispatch-scoring/dispatch-scoring.service";
import { DispatchConfigService } from "../dispatch-scoring/dispatch-config.service";
import { DispatchDecision, DispatchCohort, DispatchMethod, DispatchStatus } from "./entities/dispatch-decision.entity";
import { Driver } from "../drivers/entities/driver.entity";
import { Delivery } from "../deliveries/entities/delivery.entity";

@Injectable()
export class SafeDispatchService {
  private readonly logger = new Logger(SafeDispatchService.name);

  // Default rollout configuration
  private readonly DEFAULT_ROLLOUT_CONFIG = {
    scoringEnabled: false,
    rolloutPercentage: 0,
    abTestGroups: {
      control: 50,
      scoring: 50,
    },
    fallbackThresholds: {
      maxProcessingTime: 5000, // 5 seconds
      maxFailureRate: 0.1, // 10%
      minAcceptanceRate: 0.7, // 70%
    },
  };

  constructor(
    @InjectRepository(DispatchDecision)
    private readonly dispatchDecisionRepository: Repository<DispatchDecision>,
    private readonly dispatchScoringService: DispatchScoringService,
    private readonly dispatchConfigService: DispatchConfigService,
    private readonly dataSource: DataSource,
  ) {}

  /**
   * Check if scoring-based dispatch is enabled
   */
  async isScoringEnabled(): Promise<boolean> {
    try {
      const config = await this.dispatchConfigService.getConfig("ROLLOUT_SETTINGS" as any);
      return config?.scoringEnabled || false;
    } catch (error) {
      this.logger.error("Failed to check scoring enabled status:", error);
      return false;
    }
  }

  /**
   * Get current rollout percentage
   */
  async getRolloutPercentage(): Promise<number> {
    try {
      const config = await this.dispatchConfigService.getConfig("ROLLOUT_SETTINGS" as any);
      return config?.rolloutPercentage || 0;
    } catch (error) {
      this.logger.error("Failed to get rollout percentage:", error);
      return 0;
    }
  }

  /**
   * Assign delivery to A/B test cohort
   */
  async assignToCohort(deliveryId: string): Promise<DispatchCohort> {
    try {
      const rolloutPercentage = await this.getRolloutPercentage();
      
      // Use delivery ID as seed for consistent assignment
      const seed = this.hashString(deliveryId);
      const randomValue = seed % 100;

      if (randomValue < rolloutPercentage) {
        return DispatchCohort.SCORING;
      } else {
        return DispatchCohort.CONTROL;
      }
    } catch (error) {
      this.logger.error(`Failed to assign delivery ${deliveryId} to cohort:`, error);
      return DispatchCohort.CONTROL; // Default to control on error
    }
  }

  /**
   * Create dispatch decision record
   */
  async createDispatchDecision(
    deliveryId: string,
    cohort: DispatchCohort,
    method: DispatchMethod,
    metadata?: Record<string, any>,
  ): Promise<DispatchDecision> {
    const decision = this.dispatchDecisionRepository.create({
      deliveryId,
      cohort,
      dispatchMethod: method,
      dispatchStatus: DispatchStatus.PENDING,
      metadata,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    return await this.dispatchDecisionRepository.save(decision);
  }

  /**
   * Update dispatch decision status
   */
  async updateDispatchDecision(
    decisionId: string,
    updates: Partial<DispatchDecision>,
  ): Promise<DispatchDecision> {
    const decision = await this.dispatchDecisionRepository.findOne({
      where: { id: decisionId },
    });

    if (!decision) {
      throw new NotFoundException(`Dispatch decision not found: ${decisionId}`);
    }

    Object.assign(decision, updates);
    decision.updatedAt = new Date();

    return await this.dispatchDecisionRepository.save(decision);
  }

  /**
   * Fallback to legacy dispatch
   */
  async fallbackToLegacyDispatch(
    deliveryId: string,
    reason: string,
    metadata?: Record<string, any>,
  ): Promise<DispatchDecision> {
    this.logger.warn(`Falling back to legacy dispatch for delivery ${deliveryId}: ${reason}`);

    const decision = await this.createDispatchDecision(
      deliveryId,
      DispatchCohort.CONTROL,
      DispatchMethod.LEGACY,
      {
        fallbackReason: reason,
        originalMetadata: metadata,
      },
    );

    return decision;
  }

  /**
   * Check if fallback is needed based on health metrics
   */
  async shouldFallback(deliveryId: string): Promise<{ shouldFallback: boolean; reason?: string }> {
    try {
      const config = await this.dispatchConfigService.getConfig("ROLLOUT_SETTINGS" as any);
      const thresholds = config?.fallbackThresholds || this.DEFAULT_ROLLOUT_CONFIG.fallbackThresholds;

      // Check recent failure rate
      const recentFailures = await this.getRecentFailureRate();
      if (recentFailures > thresholds.maxFailureRate) {
        return {
          shouldFallback: true,
          reason: `High failure rate: ${recentFailures} > ${thresholds.maxFailureRate}`,
        };
      }

      // Check recent processing time
      const avgProcessingTime = await this.getAverageProcessingTime();
      if (avgProcessingTime > thresholds.maxProcessingTime) {
        return {
          shouldFallback: true,
          reason: `High processing time: ${avgProcessingTime}ms > ${thresholds.maxProcessingTime}ms`,
        };
      }

      // Check acceptance rate
      const acceptanceRate = await this.getRecentAcceptanceRate();
      if (acceptanceRate < thresholds.minAcceptanceRate) {
        return {
          shouldFallback: true,
          reason: `Low acceptance rate: ${acceptanceRate} < ${thresholds.minAcceptanceRate}`,
        };
      }

      return { shouldFallback: false };
    } catch (error) {
      this.logger.error(`Error checking fallback conditions for delivery ${deliveryId}:`, error);
      return {
        shouldFallback: true,
        reason: "Error checking fallback conditions",
      };
    }
  }

  /**
   * Execute safe dispatch with fallback mechanism
   */
  async executeSafeDispatch(
    deliveryId: string,
    eligibleDrivers: Array<{ driverId: string; score: number; driver: Driver }>,
    fallbackCallback: (deliveryId: string, reason: string) => Promise<any>,
  ): Promise<any> {
    const startTime = Date.now();
    const cohort = await this.assignToCohort(deliveryId);
    const decision = await this.createDispatchDecision(
      deliveryId,
      cohort,
      cohort === DispatchCohort.SCORING ? DispatchMethod.SCORING_BASED : DispatchMethod.LEGACY,
    );

    try {
      // Check if fallback is needed before attempting scoring
      if (cohort === DispatchCohort.SCORING) {
        const fallbackCheck = await this.shouldFallback(deliveryId);
        if (fallbackCheck.shouldFallback) {
          await this.updateDispatchDecision(decision.id, {
            dispatchStatus: DispatchStatus.FAILED,
            fallbackReason: fallbackCheck.reason,
            processingTimeMs: Date.now() - startTime,
          });

          return await fallbackCallback(deliveryId, fallbackCheck.reason!);
        }
      }

      // Execute dispatch based on cohort
      let result;
      if (cohort === DispatchCohort.SCORING) {
        result = await this.executeScoringDispatch(deliveryId, eligibleDrivers);
        await this.updateDispatchDecision(decision.id, {
          dispatchStatus: DispatchStatus.ASSIGNED,
          processingTimeMs: Date.now() - startTime,
          scoreUsed: eligibleDrivers[0]?.score,
        });
      } else {
        result = await fallbackCallback(deliveryId, "Control group");
        await this.updateDispatchDecision(decision.id, {
          dispatchStatus: DispatchStatus.ASSIGNED,
          processingTimeMs: Date.now() - startTime,
          dispatchMethod: DispatchMethod.LEGACY,
        });
      }

      return result;
    } catch (error) {
      this.logger.error(`Dispatch failed for delivery ${deliveryId}:`, error);

      await this.updateDispatchDecision(decision.id, {
        dispatchStatus: DispatchStatus.FAILED,
        fallbackReason: error.message,
        processingTimeMs: Date.now() - startTime,
      });

      // Fallback to legacy dispatch on error
      return await fallbackCallback(deliveryId, `Dispatch error: ${error.message}`);
    }
  }

  /**
   * Execute scoring-based dispatch
   */
  private async executeScoringDispatch(
    deliveryId: string,
    eligibleDrivers: Array<{ driverId: string; score: number; driver: Driver }>,
  ): Promise<any> {
    // Sort drivers by score (highest first)
    const sortedDrivers = eligibleDrivers.sort((a, b) => b.score - a.score);

    if (sortedDrivers.length === 0) {
      throw new BadRequestException("No eligible drivers found for scoring dispatch");
    }

    // Select top driver
    const selectedDriver = sortedDrivers[0];

    this.logger.log(`Selected driver ${selectedDriver.driverId} with score ${selectedDriver.score} for delivery ${deliveryId}`);

    // Here you would integrate with the actual dispatch logic
    // For now, return the selected driver information
    return {
      deliveryId,
      driverId: selectedDriver.driverId,
      score: selectedDriver.score,
      method: "SCORING_BASED",
    };
  }

  // Private helper methods

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  private async getRecentFailureRate(): Promise<number> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    const totalDecisions = await this.dispatchDecisionRepository.count({
      where: {
        createdAt: oneHourAgo,
      },
    });

    if (totalDecisions === 0) return 0;

    const failedDecisions = await this.dispatchDecisionRepository.count({
      where: {
        createdAt: oneHourAgo,
        dispatchStatus: DispatchStatus.FAILED,
      },
    });

    return failedDecisions / totalDecisions;
  }

  private async getAverageProcessingTime(): Promise<number> {
    const result = await this.dispatchDecisionRepository
      .createQueryBuilder("decision")
      .select("AVG(decision.processingTimeMs)", "avgTime")
      .where("decision.processingTimeMs IS NOT NULL")
      .andWhere("decision.createdAt >= :oneHourAgo", { oneHourAgo: new Date(Date.now() - 60 * 60 * 1000) })
      .getRawOne();

    return result?.avgTime || 0;
  }

  private async getRecentAcceptanceRate(): Promise<number> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    const totalDecisions = await this.dispatchDecisionRepository.count({
      where: {
        createdAt: oneHourAgo,
        dispatchMethod: DispatchMethod.SCORING_BASED,
      },
    });

    if (totalDecisions === 0) return 1; // No data, assume good

    const assignedDecisions = await this.dispatchDecisionRepository.count({
      where: {
        createdAt: oneHourAgo,
        dispatchMethod: DispatchMethod.SCORING_BASED,
        dispatchStatus: DispatchStatus.ASSIGNED,
      },
    });

    return assignedDecisions / totalDecisions;
  }

  /**
   * Get dispatch health metrics
   */
  async getDispatchHealthMetrics(): Promise<{
    totalDecisions: number;
    successRate: number;
    averageProcessingTime: number;
    scoringEnabled: boolean;
    rolloutPercentage: number;
    recentMetrics: {
      lastHour: { successRate: number; avgProcessingTime: number };
      lastDay: { successRate: number; avgProcessingTime: number };
    };
  }> {
    const totalDecisions = await this.dispatchDecisionRepository.count();
    const successRate = await this.getSuccessRate();
    const averageProcessingTime = await this.getAverageProcessingTime();

    return {
      totalDecisions,
      successRate,
      averageProcessingTime,
      scoringEnabled: await this.isScoringEnabled(),
      rolloutPercentage: await this.getRolloutPercentage(),
      recentMetrics: {
        lastHour: {
          successRate: await this.getSuccessRate(new Date(Date.now() - 60 * 60 * 1000)),
          avgProcessingTime: await this.getAverageProcessingTime(),
        },
        lastDay: {
          successRate: await this.getSuccessRate(new Date(Date.now() - 24 * 60 * 60 * 1000)),
          avgProcessingTime: await this.getAverageProcessingTime(),
        },
      },
    };
  }

  private async getSuccessRate(since?: Date): Promise<number> {
    const query = this.dispatchDecisionRepository
      .createQueryBuilder("decision")
      .select("COUNT(*)", "total")
      .addSelect("SUM(CASE WHEN decision.dispatchStatus = :assigned THEN 1 ELSE 0 END)", "successes");

    if (since) {
      query.where("decision.createdAt >= :since", { since });
    }

    const result = await query.getRawOne();
    const total = parseInt(result.total) || 0;
    const successes = parseInt(result.successes) || 0;

    return total > 0 ? successes / total : 1;
  }
}