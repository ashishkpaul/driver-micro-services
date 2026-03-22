import { Injectable, Logger } from "@nestjs/common";

export interface CircuitBreakerConfig {
  failureThreshold: number;
  recoveryTimeout: number;
  halfOpenMaxCalls: number;
  monitoringWindow: number;
}

export enum CircuitState {
  CLOSED = "CLOSED",
  OPEN = "OPEN",
  HALF_OPEN = "HALF_OPEN",
}

export interface CircuitBreakerMetrics {
  state: CircuitState;
  failures: number;
  successes: number;
  totalCalls: number;
  lastFailureTime: Date | null;
  lastSuccessTime: Date | null;
  lastStateChange: Date;
}

@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);
  private circuits = new Map<string, CircuitBreakerState>();

  constructor() {}

  /**
   * Execute a function with circuit breaker protection
   */
  async execute<T>(
    circuitName: string,
    fn: () => Promise<T>,
    config: CircuitBreakerConfig = this.getDefaultConfig(),
  ): Promise<T> {
    const state = this.getCircuitState(circuitName, config);

    if (state.state === CircuitState.OPEN) {
      if (
        Date.now() - state.lastFailureTime.getTime() >
        config.recoveryTimeout
      ) {
        this.logger.log(`Circuit ${circuitName} transitioning to HALF_OPEN`);
        state.state = CircuitState.HALF_OPEN;
        state.halfOpenCallCount = 0;
      } else {
        throw new Error(
          `Circuit breaker OPEN for ${circuitName} - service degraded`,
        );
      }
    }

    if (
      state.state === CircuitState.HALF_OPEN &&
      state.halfOpenCallCount >= config.halfOpenMaxCalls
    ) {
      throw new Error(
        `Circuit breaker HALF_OPEN limit reached for ${circuitName}`,
      );
    }

    try {
      const result = await fn();
      this.onSuccess(circuitName, state);
      return result;
    } catch (error) {
      this.onFailure(circuitName, state, error);
      throw error;
    }
  }

  /**
   * Get circuit breaker metrics
   */
  getMetrics(circuitName: string): CircuitBreakerMetrics | null {
    const state = this.circuits.get(circuitName);
    if (!state) return null;

    return {
      state: state.state,
      failures: state.failures,
      successes: state.successes,
      totalCalls: state.totalCalls,
      lastFailureTime: state.lastFailureTime,
      lastSuccessTime: state.lastSuccessTime,
      lastStateChange: state.lastStateChange,
    };
  }

  /**
   * Get all circuit metrics
   */
  getAllMetrics(): Record<string, CircuitBreakerMetrics> {
    const metrics: Record<string, CircuitBreakerMetrics> = {};
    for (const [name, state] of this.circuits.entries()) {
      metrics[name] = this.getMetrics(name)!;
    }
    return metrics;
  }

  /**
   * Reset a circuit breaker (for testing or manual intervention)
   */
  resetCircuit(circuitName: string): void {
    this.circuits.delete(circuitName);
    this.logger.log(`Circuit ${circuitName} reset to CLOSED state`);
  }

  /**
   * Force a circuit breaker to a specific state (for testing)
   */
  setCircuitState(circuitName: string, state: CircuitState): void {
    const circuitState = this.getCircuitState(circuitName);
    circuitState.state = state;
    circuitState.lastStateChange = new Date();
    this.logger.log(`Circuit ${circuitName} forced to ${state} state`);
  }

  private getCircuitState(
    circuitName: string,
    config?: CircuitBreakerConfig,
  ): CircuitBreakerState {
    if (!this.circuits.has(circuitName)) {
      this.circuits.set(
        circuitName,
        new CircuitBreakerState(circuitName, config),
      );
    }
    return this.circuits.get(circuitName)!;
  }

  private onSuccess(circuitName: string, state: CircuitBreakerState): void {
    state.successes++;
    state.totalCalls++;
    state.lastSuccessTime = new Date();
    state.halfOpenCallCount = 0;

    if (state.state === CircuitState.HALF_OPEN) {
      // Success in HALF_OPEN means circuit is healthy again
      state.state = CircuitState.CLOSED;
      state.failures = 0;
      state.lastStateChange = new Date();
      this.logger.log(`Circuit ${circuitName} recovered to CLOSED state`);
    }
  }

  private onFailure(
    circuitName: string,
    state: CircuitBreakerState,
    error: Error,
  ): void {
    state.failures++;
    state.totalCalls++;
    state.lastFailureTime = new Date();

    if (state.state === CircuitState.HALF_OPEN) {
      state.halfOpenCallCount++;
    }

    // Check if we should open the circuit
    if (state.failures >= state.config.failureThreshold) {
      if (state.state !== CircuitState.OPEN) {
        state.state = CircuitState.OPEN;
        state.lastStateChange = new Date();
        this.logger.warn(
          `Circuit ${circuitName} opened due to ${state.failures} failures`,
        );
      }
    }
  }

  private getDefaultConfig(): CircuitBreakerConfig {
    return {
      failureThreshold: 5,
      recoveryTimeout: 300000, // 5 minutes
      halfOpenMaxCalls: 3,
      monitoringWindow: 600000, // 10 minutes
    };
  }
}

class CircuitBreakerState {
  state: CircuitState = CircuitState.CLOSED;
  failures: number = 0;
  successes: number = 0;
  totalCalls: number = 0;
  lastFailureTime: Date = new Date(0);
  lastSuccessTime: Date = new Date(0);
  lastStateChange: Date = new Date();
  halfOpenCallCount: number = 0;
  config: CircuitBreakerConfig;

  constructor(
    public name: string,
    config?: CircuitBreakerConfig,
  ) {
    this.config = config || {
      failureThreshold: 5,
      recoveryTimeout: 300000,
      halfOpenMaxCalls: 3,
      monitoringWindow: 600000,
    };
  }
}
