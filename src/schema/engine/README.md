# Schema Planning Engine

Production-grade migration planning system for automated database schema evolution.

## Overview

This schema planning engine implements a complete pipeline for analyzing, classifying, and planning database migrations with enterprise-level safety and governance features.

## Architecture

```
Entity Snapshot → Database Snapshot → Schema Diff → Operation Classification → 
Risk Analysis → Lifecycle Split → Dependency Graph → Migration Generation → 
Simulation → Drift Enforcement → Execution Approval
```

## Core Components

### 1. Schema Planning (`schema-planner.ts`)

Central orchestration brain that coordinates the entire migration planning pipeline.

**Key Features:**

- Entity vs database schema comparison
- Automated operation classification
- Risk and compatibility analysis
- Lifecycle phase splitting
- Dependency graph generation

### 2. Entity Snapshot (`entity-snapshot.ts`)

Extracts schema information from TypeORM entities and metadata.

**Capabilities:**

- Table and column extraction
- Index and constraint detection
- Enum type discovery
- Primary key and foreign key mapping

### 3. Database Snapshot (`database-snapshot.ts`)

Reads actual database schema from PostgreSQL information_schema.

**Features:**

- Live schema introspection
- Table structure analysis
- Index and constraint mapping
- Enum type extraction

### 4. Operation Classification (`classify-operations.ts`)

Intelligently classifies SQL operations by risk and type.

**Classification Rules:**

- **SAFE**: CREATE TABLE, CREATE INDEX, ADD COLUMN (nullable)
- **DATA**: UPDATE, INSERT, DELETE, COPY
- **BREAKING**: DROP TABLE/COLUMN, ALTER TYPE, SET NOT NULL

### 5. Lifecycle Splitting (`lifecycle-split.ts`)

Implements the Expand-Migrate-Contract pattern for safe schema evolution.

**Automatic Splitting:**

- NOT NULL violations → SAFE + DATA + BREAKING
- Column renames → SAFE + DATA + BREAKING
- Type changes → SAFE + DATA + BREAKING

### 6. Operation Graph (`operation-graph.ts`)

Builds dependency graphs to ensure safe execution order.

**Features:**

- Table dependency analysis
- Foreign key relationship mapping
- Constraint dependency tracking
- Cycle detection and validation

### 7. Risk Analysis (`risk-analyzer.ts`)

Comprehensive risk assessment for production deployments.

**Risk Categories:**

- **PERFORMANCE**: Large table operations, blocking operations
- **DATA_LOSS**: DROP operations, SET NOT NULL without defaults
- **BLOCKING**: Table locks, schema locks
- **COMPATIBILITY**: Breaking schema changes, API incompatibilities

### 8. Compatibility Check (`compatibility-check.ts`)

Analyzes backward compatibility and migration safety.

**Checks:**

- Breaking change detection
- API compatibility validation
- Migration ordering requirements
- Phase separation enforcement

## Usage

### Basic Migration Planning

```typescript
import { buildMigrationPlan, validateMigrationPlan } from './migration-engine/schema-planner';

// Build migration plan from entity changes
const plan = await buildMigrationPlan('src/config/data-source.ts');

// Validate for production safety
const validation = validateMigrationPlan(plan);

if (validation.isValid) {
  console.log('✅ Migration plan is safe for production');
} else {
  console.log('❌ Migration plan has issues:', validation.errors);
}
```

### Risk Analysis

```typescript
import { analyzeRisk, calculateRiskScore } from './migration-engine/risk-analyzer';

const risks = analyzeRisk(operations);
const score = calculateRiskScore(operations);

console.log(`Risk score: ${score}/100`);
console.log(`Critical risks: ${risks.filter(r => r.severity === 'CRITICAL').length}`);
```

### Compatibility Checking

```typescript
import { checkCompatibility, getCompatibilitySummary } from './migration-engine/compatibility-check';

const report = checkCompatibility(operations);
const summary = getCompatibilitySummary(operations);

console.log('Breaking changes:', report.breakingChanges);
console.log('API compatible:', report.apiCompatibility);
```

## Migration Lifecycle

### Expand Phase (SAFE)

- Add new tables, columns, indexes
- Must be backward compatible
- No data modifications

### Migrate Phase (DATA)

- Data backfills and transformations
- Bulk data operations
- Can run concurrently with application

### Contract Phase (BREAKING)

- Drop old columns, tables, constraints
- Schema cleanup operations
- Requires coordination with application deployment

## Safety Features

### Zero-Drift Enforcement

- Pre-commit: Entity changes require migrations
- Pre-deploy: No schema drift allowed
- Post-migration: Schema verification

### Online-Safe Migrations

- Automatic expand-contract splitting
- Column rename → add/copy/drop pattern
- Type changes → temp column pattern
- Large table detection and warnings

### Risk Scoring

- LOW: Safe operations (< 30 seconds)
- MEDIUM: Moderate risk (30 seconds - 5 minutes)
- HIGH: High risk (5-30 minutes, blocking)
- CRITICAL: Very high risk (data loss potential)

## Integration

### With Existing CLI

The schema planning engine integrates seamlessly with your existing migration CLI:

```bash
# Generate migration with new planning engine
npm run migrate:generate -- AddDriverRating

# The CLI will use the schema planning engine internally
# and generate properly classified, lifecycle-split migrations
```

### With Governance Pipeline

All existing governance checks continue to work:

- Zero-drift enforcement
- Simulation validation
- Approval workflows
- CI/CD integration

## Production Deployment

### Pre-Deployment

1. Run schema planning engine
2. Validate migration plan
3. Check risk score and compatibility
4. Get required approvals for critical operations

### Deployment

1. Deploy application changes first (if needed)
2. Apply SAFE phase migrations
3. Apply DATA phase migrations
4. Apply CONTRACT phase migrations
5. Verify schema consistency

### Post-Deployment

1. Run zero-drift check
2. Monitor for performance issues
3. Validate data integrity
4. Update documentation

## Best Practices

### Schema Design

- Always use nullable columns initially
- Prefer adding columns over modifying existing ones
- Use expand-contract pattern for all breaking changes
- Plan large table operations during maintenance windows

### Migration Development

- Test migrations on staging with production-like data
- Use the schema planning engine for all migrations
- Validate risk scores and compatibility reports
- Document breaking changes and rollback procedures

### Production Safety

- Never mix phases in single migrations
- Always have rollback plans for critical operations
- Monitor migration execution time and impact
- Use feature flags for schema-dependent functionality

## Troubleshooting

### Common Issues

**High Risk Score:**

- Check for large table operations
- Verify blocking operations are necessary
- Consider splitting complex operations

**Compatibility Issues:**

- Review breaking changes
- Update application code before deployment
- Use feature flags for gradual rollout

**Dependency Conflicts:**

- Check operation graph for cycles
- Verify table dependencies
- Split conflicting operations into separate migrations

### Debugging

Enable verbose logging:
```typescript
// Add to your migration config
process.env.DEBUG = 'migration-engine:*';
```

Check migration plan details:
```typescript
console.log('Operations:', plan.operations.length);
console.log('Phases:', plan.phases.map(p => p.phase));
console.log('Risks:', plan.risks.map(r => r.severity));
```

## Future Enhancements

### Phase 2: Advanced Safety & Governance

- Shadow database testing
- Performance impact simulation
- Automated rollback validation
- Canary migration support

### Phase 3: Production Features

- Migration runtime tracking
- App version compatibility checking
- Automated approval workflows
- Production monitoring integration

## Contributing

When adding new features:

1. Follow the existing architecture patterns
2. Add comprehensive tests
3. Update documentation
4. Ensure backward compatibility
5. Test with real-world scenarios

## License

This schema planning engine is part of the driver-micro-services project.