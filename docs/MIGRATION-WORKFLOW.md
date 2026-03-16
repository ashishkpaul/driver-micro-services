# Migration Workflow (Idempotency + Naming Policy)

This project enforces migration safety in three layers:

1. **Naming policy** (SAFE_/DATA_/BREAKING_)
2. **Dangerous SQL guard** (DROP/ALTER checks)
3. **Idempotency test** (re-run migrations without schema drift)

---

## 1) Generate migrations with enforced naming

Use one of these prefixes in migration names:

- `SAFE_`
- `DATA_`
- `BREAKING_`

Example:

```bash
npm run migration:generate -- SAFE_add_driver_rating
```

If the prefix is missing, generation fails fast.

---

## 2) Validate migration filename policy

```bash
npm run migration:naming
```

Default behavior checks the latest migration. To check all:

```bash
MIGRATION_NAMING_CHECK_ALL=true npm run migration:naming
```

Legacy names are allowed by default for historical migrations. To enforce strict policy on all files:

```bash
MIGRATION_NAMING_ALLOW_LEGACY=false MIGRATION_NAMING_CHECK_ALL=true npm run migration:naming
```

---

## 3) Validate dangerous SQL patterns

```bash
npm run migration:guard
```

Default behavior checks latest migration. Full scan:

```bash
MIGRATION_GUARD_CHECK_ALL=true npm run migration:guard
```

Break-glass override (only for reviewed production exceptions):

```bash
ALLOW_DANGEROUS_MIGRATIONS=true npm run migration:guard
```

---

## 4) Deploy migrations safely

```bash
npm run db:deploy
```

This runs:

1. `migration:naming`
2. `migration:guard`
3. controlled migration deploy (`scripts/db-deploy.ts`)

If an existing schema is detected with pending history mismatch, deploy uses **baseline fake-run** mode to mark migrations as executed safely.

---

## 5) Drift detection

```bash
npm run db:drift
```

Fails if:

- pending migrations exist, or
- DB migration history contains names not present in code.

---

## 6) Idempotency test suite

```bash
npm run test:migrations
```

This test:

- runs migrations,
- fingerprints schema (columns + indexes),
- runs migrations again,
- verifies no further migrations apply and schema fingerprint is unchanged.
