/**
 * Migration State Machine
 *
 * Enforces proper migration execution order and prevents partial migrations.
 * This is the core component that eliminates CI mismatches and simulation errors.
 */

export enum MigrationState {
  PLANNED,
  VALIDATED,
  SIMULATED,
  APPROVED,
  REPLAYED,
  EXECUTING,
  COMPLETED,
  FAILED,
  ROLLED_BACK,
}

export interface MigrationStateTransition {
  from: MigrationState;
  to: MigrationState;
  allowed: boolean;
  reason?: string;
}

export interface MigrationStateRecord {
  migrationId: string;
  state: MigrationState;
  startedAt: Date;
  completedAt?: Date;
  checksum?: string;
  planHash?: string;
  error?: string;
  metadata?: Record<string, any>;
}

/**
 * Migration State Machine
 *
 * Enforces state transitions and validates migration execution
 */
export class MigrationStateMachine {
  private static readonly TRANSITIONS: Record<
    MigrationState,
    MigrationState[]
  > = {
    [MigrationState.PLANNED]: [MigrationState.VALIDATED],
    [MigrationState.VALIDATED]: [MigrationState.SIMULATED],
    [MigrationState.SIMULATED]: [MigrationState.APPROVED],
    [MigrationState.APPROVED]: [MigrationState.REPLAYED],
    [MigrationState.REPLAYED]: [MigrationState.EXECUTING],
    [MigrationState.EXECUTING]: [
      MigrationState.COMPLETED,
      MigrationState.FAILED,
    ],
    [MigrationState.FAILED]: [MigrationState.ROLLED_BACK],
    [MigrationState.COMPLETED]: [],
    [MigrationState.ROLLED_BACK]: [],
  };

  /**
   * Check if a state transition is valid
   */
  public static canTransition(
    from: MigrationState,
    to: MigrationState,
  ): boolean {
    const allowedTransitions = this.TRANSITIONS[from];
    return allowedTransitions.includes(to);
  }

  /**
   * Get valid next states for a given state
   */
  public static getNextStates(from: MigrationState): MigrationState[] {
    return this.TRANSITIONS[from] || [];
  }

  /**
   * Validate transition with detailed reasoning
   */
  public static validateTransition(
    from: MigrationState,
    to: MigrationState,
  ): MigrationStateTransition {
    const allowed = this.canTransition(from, to);
    const reason = allowed
      ? `Valid transition from ${from} to ${to}`
      : `Invalid transition: ${from} → ${to} (must follow lifecycle: PLANNED → VALIDATED → SIMULATED → APPROVED → EXECUTING → COMPLETED)`;

    return {
      from,
      to,
      allowed,
      reason,
    };
  }

  /**
   * Enforce state transition with validation
   */
  public static enforceTransition(
    current: MigrationState,
    next: MigrationState,
  ): void {
    const validation = this.validateTransition(current, next);

    if (!validation.allowed) {
      throw new Error(
        `Migration state transition blocked: ${validation.reason}`,
      );
    }
  }

  /**
   * Check if migration can proceed to execution
   */
  public static canExecute(state: MigrationState): boolean {
    return state === MigrationState.APPROVED;
  }

  /**
   * Check if migration is in a terminal state
   */
  public static isTerminal(state: MigrationState): boolean {
    return (
      state === MigrationState.COMPLETED || state === MigrationState.ROLLED_BACK
    );
  }

  /**
   * Check if migration has failed
   */
  public static hasFailed(state: MigrationState): boolean {
    return (
      state === MigrationState.FAILED || state === MigrationState.ROLLED_BACK
    );
  }

  /**
   * Get migration health status
   */
  public static getHealthStatus(
    state: MigrationState,
  ): "HEALTHY" | "UNHEALTHY" | "UNKNOWN" {
    switch (state) {
      case MigrationState.COMPLETED:
        return "HEALTHY";
      case MigrationState.FAILED:
      case MigrationState.ROLLED_BACK:
        return "UNHEALTHY";
      default:
        return "UNKNOWN";
    }
  }
}

/**
 * Migration State Runtime
 *
 * Manages migration state persistence and validation
 */
export class MigrationStateRuntime {
  private stateRecords: Map<string, MigrationStateRecord> = new Map();

  /**
   * Create new migration state record
   */
  public createMigration(
    migrationId: string,
    planHash?: string,
  ): MigrationStateRecord {
    const record: MigrationStateRecord = {
      migrationId,
      state: MigrationState.PLANNED,
      startedAt: new Date(),
      planHash,
      metadata: {},
    };

    this.stateRecords.set(migrationId, record);
    return record;
  }

  /**
   * Update migration state
   */
  public updateState(
    migrationId: string,
    newState: MigrationState,
    checksum?: string,
    error?: string,
  ): MigrationStateRecord {
    const record = this.stateRecords.get(migrationId);
    if (!record) {
      throw new Error(`Migration ${migrationId} not found`);
    }

    // Validate transition
    MigrationStateMachine.enforceTransition(record.state, newState);

    // Update record
    record.state = newState;
    record.checksum = checksum;
    record.error = error;

    if (MigrationStateMachine.isTerminal(newState)) {
      record.completedAt = new Date();
    }

    return record;
  }

  /**
   * Get migration state
   */
  public getState(migrationId: string): MigrationStateRecord | undefined {
    return this.stateRecords.get(migrationId);
  }

  /**
   * List all migrations in a specific state
   */
  public getMigrationsByState(state: MigrationState): MigrationStateRecord[] {
    return Array.from(this.stateRecords.values()).filter(
      (record) => record.state === state,
    );
  }

  /**
   * Get migration health summary
   */
  public getHealthSummary(): {
    total: number;
    healthy: number;
    unhealthy: number;
    inProgress: number;
    failed: number;
  } {
    const records = Array.from(this.stateRecords.values());

    return {
      total: records.length,
      healthy: records.filter((r) => r.state === MigrationState.COMPLETED)
        .length,
      unhealthy: records.filter(
        (r) =>
          r.state === MigrationState.FAILED ||
          r.state === MigrationState.ROLLED_BACK,
      ).length,
      inProgress: records.filter(
        (r) =>
          r.state !== MigrationState.COMPLETED &&
          r.state !== MigrationState.FAILED &&
          r.state !== MigrationState.ROLLED_BACK,
      ).length,
      failed: records.filter((r) => r.state === MigrationState.FAILED).length,
    };
  }

  /**
   * Validate plan hash consistency
   */
  public validatePlanHash(migrationId: string, expectedHash: string): boolean {
    const record = this.stateRecords.get(migrationId);
    if (!record) {
      return false;
    }

    return record.planHash === expectedHash;
  }

  /**
   * Rollback migration state on failure
   */
  public rollbackState(
    migrationId: string,
    error: string,
  ): MigrationStateRecord {
    const record = this.stateRecords.get(migrationId);
    if (!record) {
      throw new Error(`Migration ${migrationId} not found`);
    }

    // Transition to FAILED, then to ROLLED_BACK
    this.updateState(migrationId, MigrationState.FAILED, undefined, error);
    return this.updateState(migrationId, MigrationState.ROLLED_BACK);
  }

  /**
   * Clean up old migration records
   */
  public cleanup(maxAgeHours: number = 24): number {
    const cutoff = new Date(Date.now() - maxAgeHours * 60 * 60 * 1000);
    let cleaned = 0;

    for (const [migrationId, record] of this.stateRecords.entries()) {
      if (record.completedAt && record.completedAt < cutoff) {
        this.stateRecords.delete(migrationId);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Export state for persistence
   */
  public exportState(): MigrationStateRecord[] {
    return Array.from(this.stateRecords.values());
  }

  /**
   * Import state from persistence
   */
  public importState(records: MigrationStateRecord[]): void {
    this.stateRecords.clear();
    for (const record of records) {
      this.stateRecords.set(record.migrationId, record);
    }
  }
}

/**
 * Migration State Guard
 *
 * Provides middleware-style validation for migration operations
 */
export class MigrationStateGuard {
  private runtime: MigrationStateRuntime;

  constructor(runtime: MigrationStateRuntime) {
    this.runtime = runtime;
  }

  /**
   * Guard migration execution
   */
  public guardExecution(migrationId: string): void {
    const record = this.runtime.getState(migrationId);
    if (!record) {
      throw new Error(`Migration ${migrationId} not found`);
    }

    if (!MigrationStateMachine.canExecute(record.state)) {
      throw new Error(
        `Migration ${migrationId} cannot execute: current state is ${record.state}, must be APPROVED`,
      );
    }
  }

  /**
   * Guard simulation
   */
  public guardSimulation(migrationId: string): void {
    const record = this.runtime.getState(migrationId);
    if (!record) {
      throw new Error(`Migration ${migrationId} not found`);
    }

    if (record.state !== MigrationState.VALIDATED) {
      throw new Error(
        `Migration ${migrationId} cannot simulate: current state is ${record.state}, must be VALIDATED`,
      );
    }
  }

  /**
   * Guard approval
   */
  public guardApproval(migrationId: string): void {
    const record = this.runtime.getState(migrationId);
    if (!record) {
      throw new Error(`Migration ${migrationId} not found`);
    }

    if (record.state !== MigrationState.SIMULATED) {
      throw new Error(
        `Migration ${migrationId} cannot approve: current state is ${record.state}, must be SIMULATED`,
      );
    }
  }

  /**
   * Validate plan consistency before execution
   */
  public validatePlanConsistency(migrationId: string, planHash: string): void {
    if (!this.runtime.validatePlanHash(migrationId, planHash)) {
      throw new Error(
        `Migration ${migrationId} plan hash mismatch: expected ${planHash}, but plan has changed`,
      );
    }
  }
}
