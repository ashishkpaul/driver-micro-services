# Driver Microservices Database Migration Platform

A production-grade, enterprise-style migration system that provides zero-intervention database migrations with comprehensive governance, safety checks, and automated baseline handling.

## 🚀 Quick Start

### First time setup

```bash
git clone <repo>
cd driver-micro-services
npm install
docker compose up -d
npm run db:migrate
```

### Daily workflow

```bash
# Create a new migration
npm run db:new AddDriverRating

# Apply migrations
npm run db:migrate

# Rollback
npm run db:rollback

# Check status
npm run db:status
```

## 📋 Complete Developer Workflow

### First time setup

```bash
git clone <repo>

cd driver-micro-services

npm install
```

### Start infrastructure

```bash
docker compose up -d
```

or

```bash
npm run db:setup
```

### Run migrations (this does everything)

```bash
npm run db:migrate
```

This automatically:

- ✅ Creates baseline if needed
- ✅ Validates all migrations
- ✅ Checks for schema drift
- ✅ Simulates SQL in dry-run transaction
- ✅ Applies migrations
- ✅ Verifies schema

### Verify system

```bash
npm run db:status
```

### Run tests

```bash
npm run test:e2e
```

### Daily workflow commands

#### When adding schema change

```bash
npm run db:new AddDriverRating
```

#### Apply

```bash
npm run db:migrate
```

#### Rollback

```bash
npm run db:rollback
```

#### Check status

```bash
npm run db:status
```

## 🛡️ Enterprise Features

### ✅ Zero-Intervention Baseline Handling

- Automatically detects fresh projects
- Creates baseline schema snapshot
- Handles both fresh DB and existing schema
- No manual baseline management required

### ✅ Comprehensive Governance

- 10 automated checks (naming, intent, size, mixed ops, delete safety, SQL guard, transaction safety, rollback coverage, timestamp order, lint)
- Auto-detects migration type (SAFE/DATA/BREAKING/FIX)
- Enforces Expand → Migrate → Contract pattern
- Prevents destructive operations without approval

### ✅ NOT NULL Safety Rewriter

- Automatically detects TypeORM's unsafe NOT NULL violations
- Rewrites into safe three-step pattern:
  1. ADD COLUMN nullable (SAFE)
  2. UPDATE with backfill (DATA)
  3. SET NOT NULL (BREAKING)
- Generates companion migrations automatically

### ✅ Phase Decomposition

- Detects mixed operation types
- Enforces proper migration phases
- Prevents schema lock issues
- Maintains backward compatibility

### ✅ Drift Detection

- Compares live schema vs TypeORM entities
- Detects manual DB changes
- Prevents silent drift
- Ensures schema consistency

### ✅ Simulation Engine

- Dry-run migration in transaction
- Validates SQL syntax and logic
- Prevents runtime failures
- Safe rollback testing

## 📁 Project Structure

```
scripts/
├── cli/migrate.ts          # Main migration CLI (Vendure-style)
├── db/
│   ├── baseline.ts         # Auto-baseline creation
│   ├── drift.ts            # Schema drift detection
│   ├── simulate.ts         # Dry-run simulation
│   └── verify.ts           # Schema verification
├── governance/             # 10 automated governance checks
└── templates/
    └── migration.template.ts # Migration file template

src/migrations/             # Generated migration files
├── 0000000000000-BASELINE_Initial.ts
├── 20250320123456-SAFE_AddDriverRating.ts
├── 20250320123457-DATA_BackfillDriverRating.ts
└── 20250320123458-BREAKING_SetRatingNotNull.ts
```

## 🎯 Prefix System (Auto-Detected)

- **SAFE_**: Additive schema changes (new tables, columns, indexes)
- **DATA_**: Data movement and backfills
- **BREAKING_**: Destructive changes (DROP, SET NOT NULL)
- **FIX_**: Targeted repair migrations
- **BASELINE_**: Full schema snapshot (auto-generated)

## 🔧 CLI Commands

### Main Commands

```bash
# Generate migration from entity changes
npm run migrate -- --generate AddDriverRating

# Run all pending migrations
npm run migrate -- --run

# Revert last migration
npm run migrate -- --revert

# Show migration status
npm run migrate -- --status
```

### Advanced Options

```bash
# Custom output directory
npm run migrate -- --generate AddDriverRating --output-dir src/migrations/pending

# Custom config
npm run migrate -- --run --config src/config/data-source.staging.ts

# Skip simulation (emergency only)
npm run migrate -- --run --skip-simulate

# Check all migrations (not just latest)
npm run migrate -- --run --check-all

# Revert multiple migrations
npm run migrate -- --revert --count 3
```

## 🚨 Safety Features

### NOT NULL Auto-Rewriting

```typescript
// TypeORM generates (DANGEROUS):
ADD "rating" integer NOT NULL

// CLI rewrites (SAFE):
ADD "rating" integer  // SAFE migration
UPDATE drivers SET "rating" = 0 WHERE "rating" IS NULL;  // DATA migration
ALTER TABLE "drivers" ALTER COLUMN "rating" SET NOT NULL;  // BREAKING migration
```

### Phase Decomposition

```typescript
// Mixed operations detected → split into phases:
// Phase 1: SAFE_AddDriverRating
// Phase 2: DATA_BackfillRating
// Phase 3: BREAKING_SetRatingNotNull
```

### Governance Checks

- ✅ Naming policy enforcement
- ✅ Intent header validation
- ✅ Size limit checking
- ✅ Mixed operation detection
- ✅ Delete safety verification
- ✅ SQL guard validation
- ✅ Transaction safety
- ✅ Rollback coverage
- ✅ Timestamp ordering
- ✅ Code linting

## 🔄 Migration Lifecycle

1. **Generate**: `npm run db:new AddDriverRating`
   - TypeORM diff → auto-classify → NOT NULL rewrite → phase decomposition
   - Generates SAFE/DATA/BREAKING files with headers

2. **Validate**: `npm run db:migrate` (governance checks)
   - 10 automated checks → fail fast on issues

3. **Simulate**: `npm run db:migrate` (dry-run)
   - Execute in transaction → rollback → validate SQL

4. **Apply**: `npm run db:migrate`
   - Run migrations → verify schema → success

5. **Rollback**: `npm run db:rollback`
   - Revert last migration → verify rollback

## 🎉 Production Ready

This system provides enterprise-grade migration capabilities equivalent to:

- ✅ Stripe's internal migration platform
- ✅ Shopify's migration tooling  
- ✅ Vendure's migration CLI
- ✅ Prisma's migration engine

**Key Benefits:**

- Zero manual baseline management
- Comprehensive safety checks
- Automated NOT NULL handling
- Phase decomposition enforcement
- Drift detection and prevention
- Dry-run simulation
- Developer-friendly CLI
- Production deployment ready

## 📞 Support

For issues or questions:

1. Check governance check output for specific errors
2. Review generated migration files
3. Use `npm run db:status` for current state
4. Run `npm run db:verify` for schema validation

**Emergency rollback:**
```bash
npm run db:rollback -- --count 5  # Revert 5 migrations