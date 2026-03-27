/**
 * Console UI Logger - Standalone console-only utilities
 * Provides structured formatting for console output without runtime wiring
 */

export class ConsoleUiLogger {
  private static readonly SEPARATOR = '═'.repeat(50);
  private static readonly THIN_SEPARATOR = '─'.repeat(50);

  /**
   * Print a section header
   */
  static section(title: string): void {
    console.log('');
    console.log(this.SEPARATOR);
    console.log(`  ${title.toUpperCase()}`);
    console.log(this.SEPARATOR);
  }

  /**
   * Print a grouped section with items
   */
  static group(title: string, items: Record<string, string | number>): void {
    console.log('');
    console.log(`┌─ ${title} ${'─'.repeat(Math.max(0, 45 - title.length))}`);
    Object.entries(items).forEach(([key, value]) => {
      console.log(`│  ${key}: ${value}`);
    });
    console.log(`└${'─'.repeat(49)}`);
  }

  /**
   * Print a success message
   */
  static success(message: string): void {
    console.log(`✓ ${message}`);
  }

  /**
   * Print a process status
   */
  static process(name: string, status: string): void {
    console.log(`  ${name}: ${status}`);
  }

  /**
   * Print a warning block
   */
  static warnBlock(title: string, message: string): void {
    console.log('');
    console.log(`┌─ ⚠ ${title} ${'─'.repeat(Math.max(0, 42 - title.length))}`);
    console.log(`│  ${message}`);
    console.log(`└${'─'.repeat(49)}`);
  }

  /**
   * Print worker status
   */
  static worker(name: string, status: string, details?: Record<string, string | number>): void {
    console.log('');
    console.log(`┌─ ⚙ ${name} ${'─'.repeat(Math.max(0, 44 - name.length))}`);
    console.log(`│  Status: ${status}`);
    if (details) {
      Object.entries(details).forEach(([key, value]) => {
        console.log(`│  ${key}: ${value}`);
      });
    }
    console.log(`└${'─'.repeat(49)}`);
  }

  /**
   * Print websocket event summary
   */
  static websocket(events: string[]): void {
    console.log('');
    console.log(`┌─ 🔌 WEBSOCKET EVENTS ${'─'.repeat(28)}`);
    events.forEach(event => {
      console.log(`│  • ${event}`);
    });
    console.log(`└${'─'.repeat(49)}`);
  }

  /**
   * Print a summary block
   */
  static summary(title: string, items: Record<string, string | number>): void {
    console.log('');
    console.log(`┌─ 📊 ${title} ${'─'.repeat(Math.max(0, 43 - title.length))}`);
    Object.entries(items).forEach(([key, value]) => {
      console.log(`│  ${key}: ${value}`);
    });
    console.log(`└${'─'.repeat(49)}`);
  }

  /**
   * Print startup time
   */
  static startupTime(duration: number): void {
    console.log('');
    console.log(`┌─ ⏱ STARTUP TIME ${'─'.repeat(33)}`);
    console.log(`│  Duration: ${duration}ms`);
    console.log(`│  Status: ${duration < 5000 ? '✓ FAST' : duration < 10000 ? '⚠ MODERATE' : '✗ SLOW'}`);
    console.log(`└${'─'.repeat(49)}`);
  }

  /**
   * Print a plain message
   */
  static log(message: string): void {
    console.log(message);
  }

  /**
   * Print a thin separator line
   */
  static separator(): void {
    console.log(this.THIN_SEPARATOR);
  }
}