import { Logger } from '@nestjs/common';

export class BootPhaseLogger {
  private readonly logger = new Logger(BootPhaseLogger.name);

  /**
   * Log start of a boot phase
   */
  startPhase(name: string): void {
    this.logger.log(`BOOT PHASE: ${name}`);
  }

  /**
   * Log completion of a boot phase
   */
  completePhase(name: string): void {
    this.logger.log(`BOOT PHASE COMPLETE: ${name}`);
  }

  /**
   * Log boot phase with status
   */
  logPhase(name: string, status: 'START' | 'COMPLETE'): void {
    this.logger.log(`BOOT PHASE ${status}: ${name}`);
  }

  /**
   * Log boot phase with duration
   */
  logPhaseWithDuration(name: string, duration: number): void {
    this.logger.log(`BOOT PHASE COMPLETE: ${name} (${duration}ms)`);
  }

  /**
   * Log boot phase error
   */
  logPhaseError(name: string, error: Error): void {
    this.logger.error(`BOOT PHASE FAILED: ${name}`, error.message);
  }

  /**
   * Log boot phase warning
   */
  logPhaseWarning(name: string, message: string): void {
    this.logger.warn(`BOOT PHASE WARNING: ${name} - ${message}`);
  }
}