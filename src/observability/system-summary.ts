/**
 * System Summary - Track and print grouped summaries
 * Provides infrastructure, modules, and workers summary printing
 */

export class SystemSummary {
  private infrastructure: Record<string, string> = {};
  private modules: string[] = [];
  private workers: Record<string, { status: string; details?: Record<string, string | number> }> = {};

  /**
   * Add infrastructure item
   */
  addInfrastructure(name: string, status: string): void {
    this.infrastructure[name] = status;
  }

  /**
   * Add module
   */
  addModule(name: string): void {
    if (!this.modules.includes(name)) {
      this.modules.push(name);
    }
  }

  /**
   * Add worker
   */
  addWorker(name: string, status: string, details?: Record<string, string | number>): void {
    this.workers[name] = { status, details };
  }

  /**
   * Print infrastructure summary
   */
  printInfrastructure(): void {
    console.log('');
    console.log('┌─ 🏗️  INFRASTRUCTURE ' + '─'.repeat(29));
    Object.entries(this.infrastructure).forEach(([name, status]) => {
      console.log(`│  ${name}: ${status}`);
    });
    console.log('└' + '─'.repeat(49));
  }

  /**
   * Print modules summary
   */
  printModules(): void {
    console.log('');
    console.log('┌─ 📦 MODULES ' + '─'.repeat(36));
    this.modules.forEach(module => {
      console.log(`│  • ${module}`);
    });
    console.log('└' + '─'.repeat(49));
  }

  /**
   * Print workers summary
   */
  printWorkers(): void {
    console.log('');
    console.log('┌─ ⚙️  WORKERS ' + '─'.repeat(36));
    Object.entries(this.workers).forEach(([name, { status, details }]) => {
      console.log(`│  ${name}: ${status}`);
      if (details) {
        Object.entries(details).forEach(([key, value]) => {
          console.log(`│    ${key}: ${value}`);
        });
      }
    });
    console.log('└' + '─'.repeat(49));
  }

  /**
   * Print full system summary
   */
  printAll(): void {
    this.printInfrastructure();
    this.printModules();
    this.printWorkers();
  }

  /**
   * Get infrastructure status
   */
  getInfrastructure(): Record<string, string> {
    return { ...this.infrastructure };
  }

  /**
   * Get modules list
   */
  getModules(): string[] {
    return [...this.modules];
  }

  /**
   * Get workers status
   */
  getWorkers(): Record<string, { status: string; details?: Record<string, string | number> }> {
    return { ...this.workers };
  }

  /**
   * Clear all data
   */
  clear(): void {
    this.infrastructure = {};
    this.modules = [];
    this.workers = {};
  }
}