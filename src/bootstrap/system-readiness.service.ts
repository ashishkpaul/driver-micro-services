import { Injectable, Logger } from '@nestjs/common';

export enum StartupPhase {
  INFRASTRUCTURE = 'INFRASTRUCTURE',
  SCHEMA = 'SCHEMA',
  WORKERS = 'WORKERS',
  API = 'API',
  READY = 'READY',
}

export interface ReadinessState {
  currentPhase: StartupPhase;
  phaseStartTime: Date | null;
  completedPhases: Set<StartupPhase>;
  isReady: boolean;
}

@Injectable()
export class SystemReadinessService {
  private readonly logger = new Logger(SystemReadinessService.name);
  
  private currentPhase: StartupPhase = StartupPhase.INFRASTRUCTURE;
  private phaseStartTime: Date | null = null;
  private completedPhases: Set<StartupPhase> = new Set();
  private ready: boolean = false;

  /**
   * Start a new startup phase
   */
  startPhase(name: StartupPhase): void {
    this.currentPhase = name;
    this.phaseStartTime = new Date();
    
    this.logPhaseTransition(name, 'START');
    
    // Reset readiness when starting a new phase
    this.ready = false;
  }

  /**
   * Complete a startup phase
   */
  completePhase(name: StartupPhase): void {
    if (this.currentPhase !== name) {
      this.logger.warn(`Attempted to complete phase ${name} but current phase is ${this.currentPhase}`);
      return;
    }

    this.completedPhases.add(name);
    this.logPhaseTransition(name, 'COMPLETE');

    // If READY phase is completed, mark system as ready
    if (name === StartupPhase.READY) {
      this.ready = true;
      this.logSystemReady();
    }
  }

  /**
   * Check if system is ready
   */
  isReady(): boolean {
    return this.ready;
  }

  /**
   * Wait until system is ready
   */
  async waitUntilReady(): Promise<void> {
    const startTime = Date.now();
    const maxWaitTime = 300000; // 5 minutes timeout
    const checkInterval = 1000; // 1 second

    while (!this.ready && (Date.now() - startTime) < maxWaitTime) {
      await new Promise(resolve => setTimeout(resolve, checkInterval));
    }

    if (!this.ready) {
      throw new Error('System readiness timeout: System did not become ready within 5 minutes');
    }
  }

  /**
   * Get current readiness state
   */
  getReadinessState(): ReadinessState {
    return {
      currentPhase: this.currentPhase,
      phaseStartTime: this.phaseStartTime,
      completedPhases: this.completedPhases,
      isReady: this.ready,
    };
  }

  /**
   * Log phase transition
   */
  private logPhaseTransition(phase: StartupPhase, action: 'START' | 'COMPLETE'): void {
    const timestamp = new Date().toISOString();
    this.logger.log(`BOOT PHASE ${action}: ${phase} - ${timestamp}`);
  }

  /**
   * Log system ready state
   */
  private logSystemReady(): void {
    const timestamp = new Date().toISOString();
    const environment = process.env.NODE_ENV || 'development';
    const uptimeStart = this.phaseStartTime ? this.phaseStartTime.toISOString() : 'unknown';
    
    this.logger.log(`SYSTEM READY`);
    this.logger.log(`Environment: ${environment}`);
    this.logger.log(`Uptime start timestamp: ${uptimeStart}`);
    this.logger.log(`Ready timestamp: ${timestamp}`);
  }
}