# Migration State Machine Architecture

## Overview

This document describes the complete Migration State Machine architecture that eliminates all structural conflicts in the migration engine. The architecture implements four key refactors that fix the original problems:

1. **MigrationExecutionPlan Model** - Fixes type model drift
2. **Migration State Machine** - Fixes simulation dependency failure  
3. **Migration Replay Engine** - Fixes simulation failures and state inconsistency
4. **Execution Planner + Unified Drift Engine** - Fixes drift contradiction

## Architecture Components

### 1. MigrationExecutionPlan Model

**File**: `scripts/migration-engine/migration-execution-plan.ts`

The `MigrationExecutionPlan` is the single truth model that unifies all migration operations across the system.

```typescript
export interface MigrationExecutionPlan {
  operations: SchemaOperation[];
  phases: PhasePlan[];
  executionOrder: string[];
  dependencies: Map<string, string[]>;
  risks: RiskReport[];
  compatibility: CompatibilityReport;
  metadata: {
    entitySnapshot: SchemaSnapshot;
    databaseSnapshot: SchemaSnapshot;
    diff: SchemaDiff;
    createdAt: string;
    version: string;
    planHash: string;
    simulationHash?: string;
  };
}
```

**Key Features:**

- Single unified model replacing inconsistent type models
- Plan hash validation for consistency
- Execution order and dependency tracking
- Built-in validation and scoring

**Fixes:**

- ✅ **Type Model Drift**: Eliminates `PhasePlan[]` vs `MigrationLifecycleSet` conflicts
- ✅ **TypeScript Errors**: Provides consistent types across all components

### 2. Migration State Machine

**File**: `scripts/migration-engine/migration-state.ts`

Enforces proper migration execution order and prevents partial migrations through state transitions.

```typescript
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
```

**State Transitions:**

```
PLANNED → VALIDATED → SIMULATED → APPROVED → REPLAYED → EXECUTING → COMPLETED
                                                            ↓
                                                          FAILED → ROLLED_BACK
```

**Key Features:**

- Enforced state transitions prevent invalid operations
- Migration state tracking and persistence
- Health monitoring and validation
- Rollback capabilities on failure

**Fixes:**

- ✅ **Simulation Dependency Failure**: Ensures proper execution order
- ✅ **CI Mismatches**: Prevents partial migrations in CI/CD
- ✅ **Missing Table Errors**: Validates dependencies before execution

### 3. Migration Replay Engine

**File**: `scripts/migration-engine/migration-replay.ts`

Rebuilds deterministic schema state for simulation by replaying all applied migrations before simulating pending ones.

```typescript
export interface MigrationReplayResult {
  success: boolean;
  errors: string[];
  warnings: string[];
  replayedMigrations: string[];
  shadowDbUrl?: string;
}
```

**Key Features:**

- Deterministic schema state reconstruction
- Shadow database support for safe simulation
- Applied migration replay before simulation
- Schema validation and consistency checking
- Baseline schema application

**Fixes:**

- ✅ **Simulation Failures**: Eliminates missing table errors
- ✅ **State Inconsistency**: Ensures simulation and execution use same state
- ✅ **CI Mismatches**: Provides deterministic simulation environment

### 4. Execution Planner

**File**: `scripts/migration-engine/execution-planner.ts`

Handles dependency resolution and ensures proper execution order for migrations.

```typescript
export class ExecutionPlanner {
  public resolveExecutionOrder(plan: MigrationExecutionPlan): ExecutionOrder;
  public simulateExecution(plan: MigrationExecutionPlan, migrationId: string): Promise<SimulationResult>;
  public validateSimulationConsistency(migrationId: string, planHash: string): boolean;
}
```

**Key Features:**

- Topological sorting for dependency resolution
- Simulation with dependency validation
- Execution readiness checks
- Time estimation and risk assessment

**Fixes:**

- ✅ **Simulation Errors**: Resolves dependency order issues
- ✅ **Missing Table Problems**: Validates table existence assumptions
- ✅ **Execution Failures**: Ensures proper operation sequencing

### 5. Unified Drift Engine

**File**: `scripts/migration-engine/drift-engine.ts`

Provides unified drift detection across entities, migrations, and schema to eliminate contradictions.

```typescript
export interface DriftReport {
  entityDrift: boolean;
  migrationDrift: boolean;
  schemaDrift: boolean;
  driftDetails: DriftDetail[];
  recommendations: string[];
}
```

**Key Features:**

- Unified drift detection across all components
- Drift resolution planning
- Validation and consistency checking
- Time estimation and risk assessment

**Fixes:**

- ✅ **Drift Contradiction**: Eliminates `db:drift` vs `db:zero-drift` conflicts
- ✅ **Inconsistent Drift Detection**: Single source of truth for drift

## Integration Points

### Schema Planner Integration

**File**: `scripts/migration-engine/schema-planner.ts`

Updated to use the unified architecture:

```typescript
// Step 8: Build unified execution plan
const executionPlan = MigrationExecutionPlanBuilder.buildFromPhases(
  lifecycle,
  classified,
  risks,
  compatibility,
  {
    entitySnapshot,
    databaseSnapshot,
    diff,
    createdAt: new Date().toISOString(),
    version: "1.0.0",
  },
);

// Step 9: Generate final migration plan
const plan: MigrationPlan = {
  operations: executionPlan.operations,
  phases: executionPlan.phases,
  graph,
  risks,
  compatibility,
  metadata: executionPlan.metadata,
};
```

### Lifecycle Split Integration

**File**: `scripts/migration-engine/lifecycle-split.ts`

Updated to return `PhasePlan[]` for compatibility with the new architecture:

```typescript
export class LifecycleSplitter {
  public split(
    operations: SchemaOperation[],
    typeMap?: Map<string, Map<string, string>>,
  ): PhasePlan[] {
    // Implementation returns PhasePlan[] for MigrationExecutionPlan compatibility
  }
}
```

## Testing

### Test Suite

**File**: `scripts/test-migration-engine.ts`

Comprehensive test suite validating all four structural refactors:

1. **MigrationExecutionPlan Model Test**: Validates unified execution plan
2. **Migration State Machine Test**: Validates state transitions
3. **Migration Replay Engine Test**: Validates state reconstruction
4. **Execution Planner Test**: Validates dependency resolution
5. **Unified Drift Engine Test**: Validates drift detection
6. **End-to-End Integration Test**: Validates complete pipeline

### Running Tests

```bash
cd ../delivery/driver-micro-services
npx ts-node scripts/test-migration-engine.ts
```

## Error Resolution

### Original Problems Fixed

#### Problem 1: Type Model Drift

**Error**: `PhasePlan[] not assignable to MigrationLifecycleSet`
**Root Cause**: Inconsistent type models across components
**Solution**: Unified `MigrationExecutionPlan` model

#### Problem 2: Simulation Dependency Failure  

**Error**: `relation "outbox_archive" does not exist`
**Root Cause**: Missing dependency resolution in simulation
**Solution**: Execution Planner with topological sorting + Migration Replay Engine

#### Problem 3: Drift Contradiction

**Error**: `db:drift` vs `db:zero-drift` showing different results
**Root Cause**: Two different drift definitions
**Solution**: Unified Drift Engine with single detection logic

### New Error Prevention

The new architecture prevents these errors through:

1. **Type Safety**: Single unified model eliminates type mismatches
2. **State Validation**: State machine prevents invalid transitions
3. **Dependency Resolution**: Execution planner ensures proper ordering
4. **State Reconstruction**: Migration Replay Engine ensures deterministic simulation
5. **Unified Detection**: Single drift engine eliminates contradictions

## Usage Examples

### Building a Migration Plan

```typescript
import { buildMigrationPlan } from './migration-engine/schema-planner';

const plan = await buildMigrationPlan('src/config/data-source.ts');
const validation = validateMigrationPlan(plan);

if (validation.isValid) {
  console.log(`Migration plan ready: ${validation.score}/100`);
} else {
  console.error('Migration plan validation failed:', validation.errors);
}
```

### Executing a Migration

```typescript
import { MigrationStateRuntime, MigrationStateMachine } from './migration-engine/migration-state';
import { ExecutionPlanner } from './migration-engine/execution-planner';
import { MigrationReplayEngine } from './migration-engine/migration-replay';

const stateRuntime = new MigrationStateRuntime();
const executionPlanner = new ExecutionPlanner(stateRuntime);
const replayEngine = new MigrationReplayEngine(dataSource, stateRuntime);

// Create migration state
const record = stateRuntime.createMigration('migration-001');

// Rebuild state for simulation
const replayResult = await replayEngine.rebuildWithValidation(plan, 'migration-001');
if (!replayResult.success) {
  throw new Error('State rebuild failed');
}

// Simulate execution
const simulation = await executionPlanner.simulateExecution(plan, 'migration-001');

if (simulation.success) {
  // Update state to APPROVED
  stateRuntime.updateState('migration-001', MigrationState.APPROVED);
  
  // Update state to REPLAYED
  stateRuntime.updateState('migration-001', MigrationState.REPLAYED);
  
  // Execute migration
  // ... actual execution logic ...
  
  // Update state to COMPLETED
  stateRuntime.updateState('migration-001', MigrationState.COMPLETED);
}
```

### Checking Drift Status

```typescript
import { DriftEngine } from './migration-engine/drift-engine';

const driftEngine = new DriftEngine(dataSource);
const driftReport = await driftEngine.checkFullDrift();

if (driftReport.entityDrift || driftReport.migrationDrift || driftReport.schemaDrift) {
  console.log('Drift detected:', driftReport.driftDetails);
  
  const resolutionPlan = await driftEngine.generateResolutionPlan(driftReport);
  console.log('Resolution plan:', resolutionPlan.actions);
}
```

## Architecture Benefits

### 1. Deterministic

- Consistent execution order through state machine
- Predictable behavior across environments
- Reliable CI/CD pipeline execution

### 2. Self-Healing

- Automatic dependency resolution
- Rollback capabilities on failure
- Health monitoring and validation

### 3. Branch Safe

- Plan hash validation prevents conflicts
- Simulation consistency checks
- State tracking across branches

### 4. CI Safe

- State machine prevents partial migrations
- Validation before execution
- Consistent drift detection

## Migration from Old Architecture

### Step 1: Update Imports

```typescript
// Old
import { splitLifecycle } from './lifecycle-split';

// New
import { LifecycleSplitter } from './lifecycle-split';
```

### Step 2: Update Function Calls

```typescript
// Old
const lifecycle = splitLifecycle(classified);

// New
const lifecycleSplitter = new LifecycleSplitter();
const lifecycle = lifecycleSplitter.split(classified);
```

### Step 3: Update Validation

```typescript
// Old
const validation = validateMigrationPlan(plan);

// New (includes execution plan validation)
const validation = validateMigrationPlan(plan);
```

### Step 4: Add State Management

```typescript
// Add state machine integration
const stateRuntime = new MigrationStateRuntime();
const executionPlanner = new ExecutionPlanner(stateRuntime);
const replayEngine = new MigrationReplayEngine(dataSource, stateRuntime);
```

## Conclusion

The Migration State Machine architecture provides a robust, production-ready solution for automated database migrations. It eliminates all structural conflicts through:

- **Unified Type Model**: Single truth model across all components
- **Enforced State Transitions**: Prevents invalid operations and partial migrations  
- **Dependency Resolution**: Ensures proper execution order
- **State Reconstruction**: Guarantees deterministic simulation
- **Unified Drift Detection**: Eliminates contradictions

This architecture is suitable for fintech-grade applications requiring high reliability and consistency in database schema evolution.