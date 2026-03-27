/**
 * Health Reporter - Simple grouped health summary printer
 * Provides health status reporting for system components
 */

export class HealthReporter {
  private components: Map<string, { status: 'HEALTHY' | 'WARNING' | 'CRITICAL'; details?: string }> = new Map();

  /**
   * Set component health status
   */
  setStatus(component: string, status: 'HEALTHY' | 'WARNING' | 'CRITICAL', details?: string): void {
    this.components.set(component, { status, details });
  }

  /**
   * Mark component as healthy
   */
  healthy(component: string, details?: string): void {
    this.setStatus(component, 'HEALTHY', details);
  }

  /**
   * Mark component as warning
   */
  warning(component: string, details?: string): void {
    this.setStatus(component, 'WARNING', details);
  }

  /**
   * Mark component as critical
   */
  critical(component: string, details?: string): void {
    this.setStatus(component, 'CRITICAL', details);
  }

  /**
   * Get component status
   */
  getStatus(component: string): { status: 'HEALTHY' | 'WARNING' | 'CRITICAL'; details?: string } | undefined {
    return this.components.get(component);
  }

  /**
   * Get overall health status
   */
  getOverallStatus(): 'HEALTHY' | 'WARNING' | 'CRITICAL' {
    let hasWarning = false;
    let hasCritical = false;

    this.components.forEach(({ status }) => {
      if (status === 'CRITICAL') hasCritical = true;
      else if (status === 'WARNING') hasWarning = true;
    });

    if (hasCritical) return 'CRITICAL';
    if (hasWarning) return 'WARNING';
    return 'HEALTHY';
  }

  /**
   * Check if system is healthy
   */
  isHealthy(): boolean {
    return this.getOverallStatus() === 'HEALTHY';
  }

  /**
   * Print health summary
   */
  printSummary(): void {
    const overall = this.getOverallStatus();
    const statusIcon = overall === 'HEALTHY' ? '✓' : overall === 'WARNING' ? '⚠' : '✗';
    const statusColor = overall === 'HEALTHY' ? '' : overall === 'WARNING' ? ' (WARNING)' : ' (CRITICAL)';

    console.log('');
    console.log(`┌─ ${statusIcon} HEALTH REPORT${statusColor} ${'─'.repeat(30)}`);
    
    this.components.forEach(({ status, details }, component) => {
      const icon = status === 'HEALTHY' ? '✓' : status === 'WARNING' ? '⚠' : '✗';
      const detailStr = details ? `: ${details}` : '';
      console.log(`│  ${icon} ${component}: ${status}${detailStr}`);
    });
    
    console.log('└' + '─'.repeat(49));
  }

  /**
   * Print detailed health report
   */
  printDetailed(): void {
    const overall = this.getOverallStatus();
    const healthyCount = Array.from(this.components.values()).filter(c => c.status === 'HEALTHY').length;
    const warningCount = Array.from(this.components.values()).filter(c => c.status === 'WARNING').length;
    const criticalCount = Array.from(this.components.values()).filter(c => c.status === 'CRITICAL').length;

    console.log('');
    console.log('═'.repeat(50));
    console.log('  DETAILED HEALTH REPORT');
    console.log('═'.repeat(50));
    console.log(`  Overall Status: ${overall}`);
    console.log(`  Components: ${this.components.size} total`);
    console.log(`    ✓ Healthy: ${healthyCount}`);
    console.log(`    ⚠ Warning: ${warningCount}`);
    console.log(`    ✗ Critical: ${criticalCount}`);
    console.log('─'.repeat(50));

    if (criticalCount > 0) {
      console.log('  CRITICAL COMPONENTS:');
      this.components.forEach(({ status, details }, component) => {
        if (status === 'CRITICAL') {
          console.log(`    ✗ ${component}: ${details || 'No details'}`);
        }
      });
      console.log('─'.repeat(50));
    }

    if (warningCount > 0) {
      console.log('  WARNING COMPONENTS:');
      this.components.forEach(({ status, details }, component) => {
        if (status === 'WARNING') {
          console.log(`    ⚠ ${component}: ${details || 'No details'}`);
        }
      });
      console.log('─'.repeat(50));
    }

    console.log('  HEALTHY COMPONENTS:');
    this.components.forEach(({ status }, component) => {
      if (status === 'HEALTHY') {
        console.log(`    ✓ ${component}`);
      }
    });
    console.log('═'.repeat(50));
  }

  /**
   * Get all components
   */
  getComponents(): Map<string, { status: 'HEALTHY' | 'WARNING' | 'CRITICAL'; details?: string }> {
    return new Map(this.components);
  }

  /**
   * Clear all components
   */
  clear(): void {
    this.components.clear();
  }
}