import { Logger } from '@nestjs/common';

export class BootPhaseLogger {
  private readonly logger = new Logger(BootPhaseLogger.name);

  /**
   * Print a section header for console output
   */
  private printSection(title: string): void {
    console.log('');
    console.log('═'.repeat(50));
    console.log(`  ${title.toUpperCase()}`);
    console.log('═'.repeat(50));
  }

  /**
   * Log start of a boot phase with formatted output
   */
  phaseStart(name: string): void {
    this.printSection(`BOOT PHASE: ${name}`);
    this.logger.log(`BOOT PHASE: ${name}`);
  }

  /**
   * Log completion of a boot phase with formatted output
   */
  phaseComplete(name: string): void {
    console.log(`✓ BOOT PHASE COMPLETE: ${name}`);
    this.logger.log(`BOOT PHASE COMPLETE: ${name}`);
  }

  /**
   * Log start of a boot phase (legacy method)
   */
  startPhase(name: string): void {
    this.logger.log(`BOOT PHASE: ${name}`);
  }

  /**
   * Log completion of a boot phase (legacy method)
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
