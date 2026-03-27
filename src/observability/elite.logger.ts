/**
 * Elite Logger - ANSI color-based dev-mode oriented logging
 * Provides color, section, request, success, slow, fail, and worker logging
 */

export class EliteLogger {
  // ANSI color codes
  private static readonly COLORS = {
    reset: '\x1b[0m',
    bright: '\x1b[1m',
    dim: '\x1b[2m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
    bgRed: '\x1b[41m',
    bgGreen: '\x1b[42m',
    bgYellow: '\x1b[43m',
    bgBlue: '\x1b[44m',
  };

  /**
   * Apply color to text
   */
  static color(text: string, color: keyof typeof this.COLORS): string {
    return `${this.COLORS[color]}${text}${this.COLORS.reset}`;
  }

  /**
   * Print a section header with color
   */
  static section(title: string): void {
    console.log('');
    console.log(this.color('═'.repeat(50), 'cyan'));
    console.log(this.color(`  ${title.toUpperCase()}`, 'bright'));
    console.log(this.color('═'.repeat(50), 'cyan'));
  }

  /**
   * Print request info
   */
  static request(method: string, url: string, traceId?: string): void {
    const trace = traceId ? this.color(` [${traceId.substring(0, 8)}]`, 'dim') : '';
    console.log(`${this.color('→', 'cyan')} ${this.color(method, 'bright')} ${url}${trace}`);
  }

  /**
   * Print success message
   */
  static success(message: string): void {
    console.log(`${this.color('✓', 'green')} ${message}`);
  }

  /**
   * Print slow operation warning
   */
  static slow(operation: string, duration: number, threshold: number = 1000): void {
    console.warn(
      `${this.color('⚠', 'yellow')} ${this.color('SLOW', 'yellow')}: ${operation} ${this.color(`(${duration}ms > ${threshold}ms)`, 'dim')}`
    );
  }

  /**
   * Print failure message
   */
  static fail(message: string, error?: Error | string): void {
    console.error(`${this.color('✗', 'red')} ${this.color('FAIL', 'red')}: ${message}`);
    if (error) {
      const errorMessage = error instanceof Error ? error.message : error;
      console.error(`  ${this.color(errorMessage, 'dim')}`);
    }
  }

  /**
   * Print worker status
   */
  static worker(name: string, status: string, details?: Record<string, string | number>): void {
    const statusColor = status === 'RUNNING' ? 'green' : status === 'STOPPED' ? 'red' : 'yellow';
    console.log('');
    console.log(`${this.color('⚙', 'cyan')} ${this.color(name, 'bright')}: ${this.color(status, statusColor)}`);
    if (details) {
      Object.entries(details).forEach(([key, value]) => {
        console.log(`  ${this.color(key, 'dim')}: ${value}`);
      });
    }
  }

  /**
   * Print info message
   */
  static info(message: string): void {
    console.log(`${this.color('ℹ', 'blue')} ${message}`);
  }

  /**
   * Print warning message
   */
  static warn(message: string): void {
    console.warn(`${this.color('⚠', 'yellow')} ${message}`);
  }

  /**
   * Print error message
   */
  static error(message: string, error?: Error | string): void {
    console.error(`${this.color('✗', 'red')} ${message}`);
    if (error) {
      const errorMessage = error instanceof Error ? error.message : error;
      console.error(`  ${this.color(errorMessage, 'dim')}`);
    }
  }

  /**
   * Print debug message (only in development)
   */
  static debug(message: string): void {
    if (process.env.NODE_ENV === 'development') {
      console.log(`${this.color('🐛', 'magenta')} ${this.color(message, 'dim')}`);
    }
  }

  /**
   * Print performance metric
   */
  static performance(label: string, duration: number): void {
    const color = duration > 1000 ? 'red' : duration > 500 ? 'yellow' : 'green';
    console.log(`${this.color('⚡', 'cyan')} ${label}: ${this.color(`${duration}ms`, color)}`);
  }

  /**
   * Print trace completion
   */
  static traceComplete(method: string, url: string, status: number, duration: number, traceId?: string): void {
    const statusColor = status < 400 ? 'green' : status < 500 ? 'yellow' : 'red';
    const trace = traceId ? this.color(` [${traceId.substring(0, 8)}]`, 'dim') : '';
    console.log(
      `${this.color('←', 'cyan')} ${this.color(method, 'bright')} ${url} ${this.color(`${status}`, statusColor)} ${this.color(`${duration}ms`, 'dim')}${trace}`
    );
  }
}