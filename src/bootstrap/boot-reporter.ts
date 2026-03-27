/**
 * Boot Reporter - Simple boot timing helper
 * Provides start/end timestamps and duration summary printing
 */

export class BootReporter {
  private startTime: number;
  private phases: Map<string, { start: number; end?: number }> = new Map();

  constructor() {
    this.startTime = Date.now();
  }

  /**
   * Start a boot phase
   */
  startPhase(name: string): void {
    this.phases.set(name, { start: Date.now() });
  }

  /**
   * End a boot phase
   */
  endPhase(name: string): void {
    const phase = this.phases.get(name);
    if (phase) {
      phase.end = Date.now();
    }
  }

  /**
   * Get phase duration
   */
  getPhaseDuration(name: string): number {
    const phase = this.phases.get(name);
    if (!phase || !phase.end) {
      return 0;
    }
    return phase.end - phase.start;
  }

  /**
   * Get total boot duration
   */
  getTotalDuration(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Print boot timing summary
   */
  printSummary(): void {
    const totalDuration = this.getTotalDuration();
    
    console.log('');
    console.log('═'.repeat(50));
    console.log('  BOOT TIMING SUMMARY');
    console.log('═'.repeat(50));
    
    this.phases.forEach((phase, name) => {
      if (phase.end) {
        const duration = phase.end - phase.start;
        console.log(`  ${name}: ${duration}ms`);
      }
    });
    
    console.log('─'.repeat(50));
    console.log(`  Total: ${totalDuration}ms`);
    console.log('═'.repeat(50));
  }

  /**
   * Print phase timing
   */
  printPhase(name: string): void {
    const duration = this.getPhaseDuration(name);
    console.log(`  ${name}: ${duration}ms`);
  }

  /**
   * Get all phase durations
   */
  getAllPhaseDurations(): Record<string, number> {
    const durations: Record<string, number> = {};
    this.phases.forEach((phase, name) => {
      if (phase.end) {
        durations[name] = phase.end - phase.start;
      }
    });
    return durations;
  }

  /**
   * Reset the reporter
   */
  reset(): void {
    this.startTime = Date.now();
    this.phases.clear();
  }
}