/**
 * Advanced Logger - Request and database logging utilities
 * Provides structured logging for requests, database queries, cache hits, and timeouts
 */

export class AdvancedLogger {
  /**
   * Log request start
   */
  static requestStart(method: string, url: string, traceId?: string): void {
    const trace = traceId ? ` [${traceId.substring(0, 8)}]` : '';
    console.log(`→ ${method} ${url}${trace}`);
  }

  /**
   * Log request end
   */
  static requestEnd(method: string, url: string, status: number, duration: number, traceId?: string): void {
    const trace = traceId ? ` [${traceId.substring(0, 8)}]` : '';
    const statusIcon = status < 400 ? '✓' : status < 500 ? '⚠' : '✗';
    console.log(`← ${statusIcon} ${method} ${url} ${status} ${duration}ms${trace}`);
  }

  /**
   * Log error
   */
  static error(message: string, error?: Error | string): void {
    console.error(`✗ ERROR: ${message}`);
    if (error) {
      const errorMessage = error instanceof Error ? error.message : error;
      console.error(`  ${errorMessage}`);
    }
  }

  /**
   * Log database query
   */
  static dbQuery(query: string, duration: number, label?: string): void {
    const labelStr = label ? ` [${label}]` : '';
    const truncatedQuery = query.length > 50 ? query.substring(0, 50) + '...' : query;
    console.log(`  DB${labelStr}: ${truncatedQuery} (${duration}ms)`);
  }

  /**
   * Log cache hit
   */
  static cacheHit(key: string, duration?: number): void {
    const durationStr = duration ? ` (${duration}ms)` : '';
    console.log(`  CACHE HIT: ${key}${durationStr}`);
  }

  /**
   * Log cache miss
   */
  static cacheMiss(key: string): void {
    console.log(`  CACHE MISS: ${key}`);
  }

  /**
   * Log timeout
   */
  static timeout(method: string, url: string, threshold: number): void {
    console.warn(`⚠ TIMEOUT: ${method} ${url} exceeded ${threshold}ms`);
  }

  /**
   * Log slow query
   */
  static slowQuery(query: string, duration: number, threshold: number = 1000): void {
    if (duration > threshold) {
      const truncatedQuery = query.length > 50 ? query.substring(0, 50) + '...' : query;
      console.warn(`⚠ SLOW QUERY: ${truncatedQuery} (${duration}ms > ${threshold}ms)`);
    }
  }

  /**
   * Log performance metric
   */
  static performance(label: string, duration: number): void {
    console.log(`  PERF: ${label} ${duration}ms`);
  }

  /**
   * Log warning
   */
  static warn(message: string): void {
    console.warn(`⚠ ${message}`);
  }

  /**
   * Log info
   */
  static info(message: string): void {
    console.log(`  ${message}`);
  }

  /**
   * Log debug
   */
  static debug(message: string): void {
    console.log(`  DEBUG: ${message}`);
  }
}