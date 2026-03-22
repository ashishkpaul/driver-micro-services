import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from "@nestjs/common";

@Injectable()
export class WorkerLifecycleService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(WorkerLifecycleService.name);

  private shutdownRequested = false;
  private shutdownTimeout = 30000; // 30 seconds
  private processingEvents = new Set<number>();
  private activeWorkers = new Set<string>();
  private shutdownPromises = new Map<string, Promise<void>>();

  onModuleInit(): void {
    this.logger.log("Worker lifecycle service initialized");
  }

  onModuleDestroy(): Promise<void> {
    return this.shutdown();
  }

  /**
   * Request graceful shutdown
   */
  async shutdown(): Promise<void> {
    if (this.shutdownRequested) {
      this.logger.warn("Shutdown already in progress");
      return;
    }

    this.shutdownRequested = true;
    this.logger.log(
      `Shutdown requested. Waiting for ${this.processingEvents.size} events to complete...`,
    );

    // Notify all active workers to stop accepting new work
    for (const workerId of this.activeWorkers) {
      this.logger.log(`Notifying worker ${workerId} to stop`);
    }

    // Wait for in-flight events to complete
    const startTime = Date.now();
    const timeoutPromise = new Promise<void>((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Shutdown timeout after ${this.shutdownTimeout}ms`));
      }, this.shutdownTimeout);
    });

    try {
      await Promise.race([this.waitForEventsToComplete(), timeoutPromise]);

      const duration = Date.now() - startTime;
      this.logger.log(
        `Shutdown completed in ${duration}ms. Processed ${this.processingEvents.size} events.`,
      );
    } catch (error) {
      this.logger.error(
        `Shutdown failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }

  /**
   * Add an event to the processing set
   */
  addProcessingEvent(eventId: number, workerId: string): void {
    this.processingEvents.add(eventId);
    this.activeWorkers.add(workerId);
    this.logger.debug(
      `Event ${eventId} started by worker ${workerId}. Total processing: ${this.processingEvents.size}`,
    );
  }

  /**
   * Remove an event from the processing set
   */
  removeProcessingEvent(eventId: number, workerId: string): void {
    this.processingEvents.delete(eventId);
    this.logger.debug(
      `Event ${eventId} completed by worker ${workerId}. Remaining: ${this.processingEvents.size}`,
    );

    // Clean up worker if no longer active
    if (this.processingEvents.size === 0) {
      this.activeWorkers.delete(workerId);
      this.logger.log(`Worker ${workerId} no longer active`);
    }
  }

  /**
   * Check if shutdown is requested
   */
  isShutdownRequested(): boolean {
    return this.shutdownRequested;
  }

  /**
   * Get current processing statistics
   */
  getProcessingStats(): {
    shutdownRequested: boolean;
    processingEvents: number;
    activeWorkers: number;
    eventIds: number[];
    workerIds: string[];
  } {
    return {
      shutdownRequested: this.shutdownRequested,
      processingEvents: this.processingEvents.size,
      activeWorkers: this.activeWorkers.size,
      eventIds: Array.from(this.processingEvents),
      workerIds: Array.from(this.activeWorkers),
    };
  }

  /**
   * Force shutdown (emergency stop)
   */
  async forceShutdown(): Promise<void> {
    this.logger.warn(
      "Force shutdown requested - events may be left incomplete",
    );
    this.shutdownRequested = true;

    // Clear all processing events immediately
    this.processingEvents.clear();
    this.activeWorkers.clear();

    this.logger.log("Force shutdown completed");
  }

  /**
   * Wait for all events to complete with timeout
   */
  private async waitForEventsToComplete(): Promise<void> {
    return new Promise((resolve) => {
      const checkInterval = setInterval(() => {
        if (this.processingEvents.size === 0) {
          clearInterval(checkInterval);
          resolve();
        }
      }, 1000);

      // Initial check
      if (this.processingEvents.size === 0) {
        clearInterval(checkInterval);
        resolve();
      }
    });
  }

  /**
   * Get shutdown status for health checks
   */
  getShutdownStatus(): {
    isShuttingDown: boolean;
    remainingEvents: number;
    shutdownTimeRemaining: number;
  } {
    const elapsed = Date.now() - (this.shutdownRequested ? Date.now() : 0);
    return {
      isShuttingDown: this.shutdownRequested,
      remainingEvents: this.processingEvents.size,
      shutdownTimeRemaining: Math.max(0, this.shutdownTimeout - elapsed),
    };
  }
}
