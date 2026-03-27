/**
 * Request Timeline - Track and print request processing steps
 * Provides step tracking and timeline printing for request analysis
 */

export class RequestTimeline {
  private steps: Array<{ name: string; startTime: number; endTime?: number; duration?: number }> = [];
  private requestStartTime: number;
  private traceId: string;

  constructor(traceId?: string) {
    this.traceId = traceId || Math.random().toString(36).substring(2, 10);
    this.requestStartTime = Date.now();
  }

  /**
   * Add a processing step
   */
  step(name: string): { end: () => void } {
    const startTime = Date.now();
    const stepIndex = this.steps.length;
    this.steps.push({ name, startTime });

    return {
      end: () => {
        const endTime = Date.now();
        const step = this.steps[stepIndex];
        if (step) {
          step.endTime = endTime;
          step.duration = endTime - startTime;
        }
      },
    };
  }

  /**
   * Add a step with duration
   */
  addStep(name: string, duration: number): void {
    this.steps.push({
      name,
      startTime: Date.now() - duration,
      endTime: Date.now(),
      duration,
    });
  }

  /**
   * Get total request duration
   */
  getTotalDuration(): number {
    return Date.now() - this.requestStartTime;
  }

  /**
   * Get trace ID
   */
  getTraceId(): string {
    return this.traceId;
  }

  /**
   * Get short trace ID (first 8 chars)
   */
  getShortTraceId(): string {
    return this.traceId.substring(0, 8);
  }

  /**
   * Get all steps
   */
  getSteps(): Array<{ name: string; startTime: number; endTime?: number; duration?: number }> {
    return [...this.steps];
  }

  /**
   * Print timeline
   */
  print(): void {
    const totalDuration = this.getTotalDuration();
    console.log('');
    console.log(`┌─ 📋 REQUEST TIMELINE [${this.getShortTraceId()}] ${'─'.repeat(25)}`);
    
    if (this.steps.length === 0) {
      console.log('│  No steps recorded');
    } else {
      this.steps.forEach((step, index) => {
        const duration = step.duration ?? 0;
        const bar = this.getDurationBar(duration, totalDuration);
        console.log(`│  ${index + 1}. ${step.name}: ${duration}ms ${bar}`);
      });
    }
    
    console.log('│  ' + '─'.repeat(46));
    console.log(`│  Total: ${totalDuration}ms`);
    console.log('└' + '─'.repeat(49));
  }

  /**
   * Get duration bar for visualization
   */
  private getDurationBar(duration: number, total: number): string {
    const percentage = total > 0 ? (duration / total) * 100 : 0;
    const barLength = Math.round(percentage / 10);
    const bar = '█'.repeat(barLength) + '░'.repeat(10 - barLength);
    return `[${bar}] ${percentage.toFixed(0)}%`;
  }

  /**
   * Print summary
   */
  printSummary(): void {
    const totalDuration = this.getTotalDuration();
    const stepDurations = this.steps
      .filter(s => s.duration !== undefined)
      .map(s => ({ name: s.name, duration: s.duration! }));
    
    const slowestStep = stepDurations.length > 0
      ? stepDurations.reduce((a, b) => a.duration > b.duration ? a : b)
      : null;

    console.log('');
    console.log(`┌─ 📊 TIMELINE SUMMARY [${this.getShortTraceId()}] ${'─'.repeat(22)}`);
    console.log(`│  Total steps: ${this.steps.length}`);
    console.log(`│  Total duration: ${totalDuration}ms`);
    if (slowestStep) {
      console.log(`│  Slowest step: ${slowestStep.name} (${slowestStep.duration}ms)`);
    }
    console.log('└' + '─'.repeat(49));
  }

  /**
   * Get timeline data
   */
  getData(): {
    traceId: string;
    totalDuration: number;
    steps: Array<{ name: string; duration: number }>;
  } {
    return {
      traceId: this.traceId,
      totalDuration: this.getTotalDuration(),
      steps: this.steps
        .filter(s => s.duration !== undefined)
        .map(s => ({ name: s.name, duration: s.duration! })),
    };
  }

  /**
   * Reset timeline
   */
  reset(): void {
    this.steps = [];
    this.requestStartTime = Date.now();
  }
}