/**
 * Performance Tracker - Simple timer class
 * Provides start/stop/duration helpers for performance measurement
 */

export class PerformanceTracker {
  private startTime: number;
  private endTime?: number;
  private label: string;

  constructor(label: string = 'Operation') {
    this.label = label;
    this.startTime = Date.now();
  }

  /**
   * Start the timer
   */
  start(): void {
    this.startTime = Date.now();
    this.endTime = undefined;
  }

  /**
   * Stop the timer
   */
  stop(): number {
    this.endTime = Date.now();
    return this.duration();
  }

  /**
   * Get duration in milliseconds
   */
  duration(): number {
    const end = this.endTime || Date.now();
    return end - this.startTime;
  }

  /**
   * Get label
   */
  getLabel(): string {
    return this.label;
  }

  /**
   * Set label
   */
  setLabel(label: string): void {
    this.label = label;
  }

  /**
   * Check if timer is running
   */
  isRunning(): boolean {
    return this.endTime === undefined;
  }

  /**
   * Reset the timer
   */
  reset(): void {
    this.startTime = Date.now();
    this.endTime = undefined;
  }

  /**
   * Print duration
   */
  print(): void {
    console.log(`  ${this.label}: ${this.duration()}ms`);
  }

  /**
   * Print duration with threshold warning
   */
  printWithThreshold(threshold: number = 1000): void {
    const duration = this.duration();
    if (duration > threshold) {
      console.warn(`  ⚠ ${this.label}: ${duration}ms (exceeded ${threshold}ms threshold)`);
    } else {
      console.log(`  ${this.label}: ${duration}ms`);
    }
  }

  /**
   * Get duration summary
   */
  getSummary(): { label: string; duration: number; isRunning: boolean } {
    return {
      label: this.label,
      duration: this.duration(),
      isRunning: this.isRunning(),
    };
  }

  /**
   * Create a child tracker
   */
  child(childLabel: string): PerformanceTracker {
    return new PerformanceTracker(`${this.label} > ${childLabel}`);
  }

  /**
   * Static helper to measure async function
   */
  static async measure<T>(label: string, fn: () => Promise<T>): Promise<{ result: T; duration: number }> {
    const tracker = new PerformanceTracker(label);
    try {
      const result = await fn();
      const duration = tracker.stop();
      return { result, duration };
    } catch (error) {
      tracker.stop();
      throw error;
    }
  }

  /**
   * Static helper to measure sync function
   */
  static measureSync<T>(label: string, fn: () => T): { result: T; duration: number } {
    const tracker = new PerformanceTracker(label);
    try {
      const result = fn();
      const duration = tracker.stop();
      return { result, duration };
    } catch (error) {
      tracker.stop();
      throw error;
    }
  }
}