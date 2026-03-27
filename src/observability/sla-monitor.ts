/**
 * SLA Monitor - Monitor request duration against SLA thresholds
 * Provides threshold-based warning logging for performance monitoring
 */

export class SlaMonitor {
  private static readonly DEFAULT_THRESHOLD = 200; // 200ms default SLA threshold
  private threshold: number;
  private violations: Array<{ name: string; duration: number; timestamp: Date }> = [];

  constructor(threshold: number = SlaMonitor.DEFAULT_THRESHOLD) {
    this.threshold = threshold;
  }

  /**
   * Check if duration exceeds SLA threshold
   */
  check(name: string, duration: number): boolean {
    if (duration > this.threshold) {
      this.violations.push({
        name,
        duration,
        timestamp: new Date(),
      });
      this.logViolation(name, duration);
      return false;
    }
    return true;
  }

  /**
   * Log SLA violation
   */
  private logViolation(name: string, duration: number): void {
    console.warn(`⚠ SLA VIOLATION: ${name} took ${duration}ms (threshold: ${this.threshold}ms)`);
  }

  /**
   * Get threshold
   */
  getThreshold(): number {
    return this.threshold;
  }

  /**
   * Set threshold
   */
  setThreshold(threshold: number): void {
    this.threshold = threshold;
  }

  /**
   * Get all violations
   */
  getViolations(): Array<{ name: string; duration: number; timestamp: Date }> {
    return [...this.violations];
  }

  /**
   * Get violation count
   */
  getViolationCount(): number {
    return this.violations.length;
  }

  /**
   * Clear violations
   */
  clearViolations(): void {
    this.violations = [];
  }

  /**
   * Print SLA summary
   */
  printSummary(): void {
    console.log('');
    console.log(`┌─ 📊 SLA MONITOR ${'─'.repeat(33)}`);
    console.log(`│  Threshold: ${this.threshold}ms`);
    console.log(`│  Violations: ${this.violations.length}`);
    if (this.violations.length > 0) {
      const avgViolation = this.violations.reduce((sum, v) => sum + v.duration, 0) / this.violations.length;
      const maxViolation = Math.max(...this.violations.map(v => v.duration));
      console.log(`│  Avg violation: ${avgViolation.toFixed(0)}ms`);
      console.log(`│  Max violation: ${maxViolation}ms`);
    }
    console.log('└' + '─'.repeat(49));
  }

  /**
   * Print recent violations
   */
  printRecentViolations(count: number = 5): void {
    const recent = this.violations.slice(-count);
    if (recent.length === 0) {
      console.log('  No recent SLA violations');
      return;
    }

    console.log('');
    console.log(`┌─ ⚠ RECENT SLA VIOLATIONS ${'─'.repeat(24)}`);
    recent.forEach((violation, index) => {
      console.log(`│  ${index + 1}. ${violation.name}: ${violation.duration}ms`);
    });
    console.log('└' + '─'.repeat(49));
  }

  /**
   * Get SLA compliance rate
   */
  getComplianceRate(totalRequests: number): number {
    if (totalRequests === 0) return 100;
    return ((totalRequests - this.violations.length) / totalRequests) * 100;
  }

  /**
   * Static helper to measure and check SLA
   */
  static async measureAndCheck<T>(
    name: string,
    fn: () => Promise<T>,
    threshold?: number,
  ): Promise<{ result: T; duration: number; withinSla: boolean }> {
    const monitor = new SlaMonitor(threshold);
    const startTime = Date.now();
    try {
      const result = await fn();
      const duration = Date.now() - startTime;
      const withinSla = monitor.check(name, duration);
      return { result, duration, withinSla };
    } catch (error) {
      const duration = Date.now() - startTime;
      monitor.check(name, duration);
      throw error;
    }
  }
}