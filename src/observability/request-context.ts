/**
 * Request Context - Track request-level metrics
 * Provides traceId, startTime, dbQueries, and cacheHits tracking
 */

export class RequestContext {
  private traceId: string;
  private startTime: number;
  private dbQueries: number = 0;
  private cacheHits: number = 0;
  private cacheMisses: number = 0;
  private steps: Array<{ name: string; duration: number }> = [];

  constructor(traceId?: string) {
    this.traceId = traceId || this.generateTraceId();
    this.startTime = Date.now();
  }

  /**
   * Generate a new trace ID
   */
  private generateTraceId(): string {
    return Math.random().toString(36).substring(2, 10);
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
   * Get request duration
   */
  duration(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Add database query
   */
  addQuery(): void {
    this.dbQueries++;
  }

  /**
   * Add cache hit
   */
  addCache(): void {
    this.cacheHits++;
  }

  /**
   * Add cache miss
   */
  addCacheMiss(): void {
    this.cacheMisses++;
  }

  /**
   * Add processing step
   */
  addStep(name: string, duration: number): void {
    this.steps.push({ name, duration });
  }

  /**
   * Get database queries count
   */
  getDbQueries(): number {
    return this.dbQueries;
  }

  /**
   * Get cache hits count
   */
  getCacheHits(): number {
    return this.cacheHits;
  }

  /**
   * Get cache misses count
   */
  getCacheMisses(): number {
    return this.cacheMisses;
  }

  /**
   * Get all steps
   */
  getSteps(): Array<{ name: string; duration: number }> {
    return [...this.steps];
  }

  /**
   * Get context summary
   */
  getSummary(): {
    traceId: string;
    duration: number;
    dbQueries: number;
    cacheHits: number;
    cacheMisses: number;
    steps: number;
  } {
    return {
      traceId: this.traceId,
      duration: this.duration(),
      dbQueries: this.dbQueries,
      cacheHits: this.cacheHits,
      cacheMisses: this.cacheMisses,
      steps: this.steps.length,
    };
  }

  /**
   * Print context summary
   */
  printSummary(): void {
    const summary = this.getSummary();
    console.log(`  Trace: ${summary.traceId} | Duration: ${summary.duration}ms | DB: ${summary.dbQueries} | Cache: ${summary.cacheHits}/${summary.cacheMisses}`);
  }
}