import { Injectable, Logger } from "@nestjs/common";
import { DriftReport } from "../engine/types";

@Injectable()
export class DriftCacheService {
  private readonly logger = new Logger(DriftCacheService.name);

  private cachedDrift?: DriftReport;
  private lastRun?: Date;
  private lastError?: Error;
  private lastErrorTime?: Date;
  private lastDurationMs?: number;

  /**
   * Update cached drift report
   */
  async update(driftReport: DriftReport, durationMs: number): Promise<void> {
    this.cachedDrift = driftReport;
    this.lastRun = new Date();
    this.lastDurationMs = durationMs;
    this.lastError = undefined;
    this.lastErrorTime = undefined;

    this.logger.log(`Drift cache updated (${durationMs}ms)`);
  }

  /**
   * Get cached drift report with status
   */
  get(): {
    report?: DriftReport;
    lastRun?: Date;
    lastDurationMs?: number;
    status: "HEALTHY" | "DEGRADED" | "FAILED" | "UNKNOWN";
    error?: string;
  } {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes

    // Check if we have a recent successful result
    if (this.cachedDrift && this.lastRun) {
      const age = now - this.lastRun.getTime();
      
      if (age < maxAge) {
        // Recent success
        const hasDrift = this.cachedDrift.entityDrift || 
                        this.cachedDrift.migrationDrift || 
                        this.cachedDrift.schemaDrift;
        
        return {
          report: this.cachedDrift,
          lastRun: this.lastRun,
          lastDurationMs: this.lastDurationMs,
          status: hasDrift ? "DEGRADED" : "HEALTHY",
        };
      }
    }

    // Check if we have a recent error
    if (this.lastError && this.lastErrorTime) {
      const errorAge = now - this.lastErrorTime.getTime();
      
      if (errorAge < maxAge) {
        // Recent error but we have old data
        return {
          report: this.cachedDrift,
          lastRun: this.lastRun,
          lastDurationMs: this.lastDurationMs,
          status: "DEGRADED",
          error: `Drift check failed: ${this.lastError.message}`,
        };
      }
    }

    // No recent data or error too old
    return {
      report: this.cachedDrift,
      lastRun: this.lastRun,
      lastDurationMs: this.lastDurationMs,
      status: "UNKNOWN",
      error: "No recent drift data available",
    };
  }

  /**
   * Mark drift check as failed
   */
  markFailed(error: Error): void {
    this.lastError = error;
    this.lastErrorTime = new Date();
    this.logger.error("Drift check failed", error);
  }

  /**
   * Clear cached data
   */
  clear(): void {
    this.cachedDrift = undefined;
    this.lastRun = undefined;
    this.lastError = undefined;
    this.lastErrorTime = undefined;
    this.lastDurationMs = undefined;
    this.logger.log("Drift cache cleared");
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    hasData: boolean;
    lastRun?: Date;
    lastDurationMs?: number;
    hasError: boolean;
    errorAge?: number;
    dataAge?: number;
  } {
    const now = Date.now();
    
    return {
      hasData: !!this.cachedDrift,
      lastRun: this.lastRun,
      lastDurationMs: this.lastDurationMs,
      hasError: !!this.lastError,
      errorAge: this.lastErrorTime ? now - this.lastErrorTime.getTime() : undefined,
      dataAge: this.lastRun ? now - this.lastRun.getTime() : undefined,
    };
  }
}