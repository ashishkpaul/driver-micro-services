Excellent — below are **ADR-002 through ADR-010**, written as **separate, formal ADR documents**, consistent with:

* `docs/architecture.md`
* `README.md`
* `INSTALLATION-CONFIGURATION.md`
* Your GA implementation (Redis GEO + PM2 + Vendure)

You can drop these files directly into `docs/` as individual Markdown files.

---

## 📄 `docs/adr-002-redis-as-performance-layer.md`

# ADR-002: Redis as Performance & Availability Layer

**Status:** Accepted
**Date:** 2026-01-27

### Context

Driver proximity search and availability checks must be fast and scalable. PostgreSQL alone is insufficient for high-frequency geo queries.

### Decision

Redis is used **only** as a performance and availability layer for:

* GEO proximity search
* Driver availability filtering
* Online heartbeat tracking

Redis is **not** used as a source of truth.

### Rationale

* Redis GEO offers O(log N) spatial queries
* Redis failures must not corrupt system state
* PostgreSQL provides durability and correctness

### Consequences

* Redis data can be safely rebuilt
* Redis outages degrade performance, not correctness
* All critical state is persisted in PostgreSQL

---

## 📄 `docs/adr-003-redis-geo-availability-invariant.md`

# ADR-003: Redis GEO Availability Invariant

**Status:** Accepted
**Date:** 2026-01-27

### Context

Incorrect Redis GEO membership can return BUSY or OFFLINE drivers, causing assignment failures.

### Decision

Enforce the invariant:

> `drivers:geo` contains **ONLY** drivers with status `AVAILABLE`

### Enforcement

* Drivers are removed from GEO immediately when:

  * Assigned (BUSY)
  * Marked OFFLINE
* Enforced in `RedisService`
* Protected by Jest tests

### Consequences

* GEOSEARCH results are always correct
* Assignment logic is simplified
* Redis remains a trustworthy accelerator

---

## 📄 `docs/adr-004-stateless-service-and-pm2-cluster.md`

# ADR-004: Stateless Service with PM2 Cluster Mode

**Status:** Accepted
**Date:** 2026-01-27

### Context

The service must scale horizontally and restart safely.

### Decision

* All application instances are stateless
* PM2 runs in **cluster mode**
* Shared Redis and PostgreSQL backing

### Rationale

* Enables multi-core utilization
* Simplifies deployments and restarts
* No session affinity required

### Consequences

* Safe horizontal scaling
* Zero-downtime restarts
* No in-memory business state

---

## 📄 `docs/adr-005-idempotency-via-postgresql.md`

# ADR-005: Idempotency via PostgreSQL

**Status:** Accepted
**Date:** 2026-01-27

### Context

Vendure retries webhook events on failure.

### Decision

Idempotency is enforced using PostgreSQL:

* Unique constraints (e.g. `sellerOrderId`)
* Existence checks before mutation

### Rationale

* Database guarantees durability
* Redis TTLs are insufficient for idempotency
* Prevents double assignment

### Consequences

* Webhook retries are safe
* No duplicate deliveries or assignments
* Deterministic behavior under retries

---

## 📄 `docs/adr-006-redis-degradation-strategy.md`

# ADR-006: Redis Degradation Strategy

**Status:** Accepted
**Date:** 2026-01-27

### Context

Redis may be temporarily unavailable.

### Decision

When Redis is unavailable:

* System logs degraded mode
* Assignment falls back to PostgreSQL
* Distance calculated in application layer

### Rationale

* Availability > performance
* Avoid total service outage

### Consequences

* Slower assignments during Redis outages
* No loss of correctness
* Clear operational visibility

---

## 📄 `docs/adr-007-health-check-design.md`

# ADR-007: Health Check Design

**Status:** Accepted
**Date:** 2026-01-27

### Context

Orchestration systems require accurate health signals.

### Decision

Expose `GET /health` reporting:

* PostgreSQL status
* Redis status

### Usage

* Docker healthcheck
* PM2 monitoring
* External observability systems

### Consequences

* Faster failure detection
* Safe restarts
* Clear dependency visibility

---

## 📄 `docs/adr-008-graceful-shutdown.md`

# ADR-008: Graceful Shutdown Handling

**Status:** Accepted
**Date:** 2026-01-27

### Context

In-flight requests must not be dropped during restarts.

### Decision

* Handle `SIGTERM`
* Enable NestJS shutdown hooks
* Align PM2 `kill_timeout` with app logic

### Rationale

* Prevent partial assignments
* Support rolling deployments

### Consequences

* Clean shutdowns
* Reduced error rates during deploys

---

## 📄 `docs/adr-009-assignment-correctness-over-speed.md`

# ADR-009: Assignment Correctness over Speed

**Status:** Accepted
**Date:** 2026-01-27

### Context

Fast but incorrect driver assignment is unacceptable.

### Decision

Favor correctness over performance:

* Strict invariants
* Defensive checks
* Safe fallbacks

### Rationale

* Wrong driver assignment breaks business trust
* Performance issues are easier to scale than logic bugs

### Consequences

* Slightly more complex logic
* Predictable and auditable behavior

---

## 📄 `docs/adr-010-explicit-non-goals.md`

# ADR-010: Explicit Non-Goals for v1

**Status:** Accepted
**Date:** 2026-01-27

### Non-Goals

The following are **explicitly excluded** from v1:

* Driver acceptance workflow
* Route optimization / multi-stop routing
* Dynamic pricing or load scoring
* Redis as authoritative state

### Rationale

* Keep v1 focused and reliable
* Avoid premature complexity

### Future Considerations

These may be revisited in v2+ once v1 is stable in production.

---

## ✅ What You Have Now

You now have:

* `architecture.md` (system-level)
* ADR-001 → ADR-010 (decision-level)
* README aligned with ops reality
* Install guide aligned with runtime reality

This is **enterprise-grade documentation**.

If you want next, I can:

* Add **Mermaid diagrams per ADR**
* Generate an **SRE runbook**
* Create **Vendure-plugin-specific ADRs**
* Produce a **v1.0.0 release notes + changelog**

Just say the word.
