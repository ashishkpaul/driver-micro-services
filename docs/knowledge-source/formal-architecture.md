Perfect — below is a **formal, ADR-style `docs/architecture.md`** that matches your **GA system**, your **README**, and your **INSTALLATION-CONFIGURATION.md**.

This is written like something an **architect, auditor, or SRE** would expect to read:
clear decisions, rationale, trade-offs, and invariants.

You can **copy-paste this verbatim** into `docs/architecture.md`.

---

# Architecture Decision Record (ADR)

## Driver Management & Delivery Orchestration Microservice

**Status:** Accepted
**Version:** v1.0.0 (GA)
**Last Updated:** 27 Jan 2026

---

## 1. Context

This service provides **driver management and delivery orchestration** for a Vendure-based commerce platform.

Vendure emits order lifecycle events (e.g. *seller-order-ready*) which must trigger:

* Selection of the **nearest available driver**
* Creation of a delivery record
* Transition of driver state (AVAILABLE → BUSY)
* Emission of delivery status updates back to Vendure

The system must operate correctly under:

* Horizontal scaling (multiple service instances)
* Event retries from Vendure
* Redis unavailability or partial failure
* High concurrency and burst traffic

---

## 2. Goals

### Functional Goals

* Correctly assign the **nearest available driver**
* Track driver availability and location in near-real time
* Maintain a complete delivery audit trail
* Support webhook-based integration with Vendure

### Non-Functional Goals

* **Correctness over performance**
* Idempotency under retries
* Horizontal scalability
* Graceful degradation
* Operational transparency

---

## 3. High-Level Architecture

```
Vendure
  │
  │  (Order events / webhooks)
  ▼
Driver Service (NestJS, stateless, PM2 cluster)
  │
  ├── Redis (GEO, status, heartbeat)
  │
  └── PostgreSQL (source of truth)
```

---

## 4. Key Architectural Decisions

### ADR-001: PostgreSQL is the Source of Truth

**Decision**
PostgreSQL is the authoritative store for:

* Drivers
* Deliveries
* Assignments
* Delivery events
* Idempotency guarantees

**Rationale**

* Strong consistency required for assignments
* Durable audit trail needed
* Redis is not suitable for authoritative state

**Consequences**

* All critical decisions can be reconstructed from PostgreSQL
* Redis failure does not cause data loss

---

### ADR-002: Redis Used Only as a Performance & Availability Layer

**Decision**
Redis is used **only** for:

* GEO proximity search
* Driver availability filtering
* Online heartbeat tracking

**Explicitly not used for:**

* Idempotency
* Authoritative state
* Business invariants

**Rationale**

* Redis provides O(log N) proximity queries
* GEO queries are faster than DB-level geospatial filtering
* Failure must not break correctness

---

### ADR-003: Strict Redis Availability Invariant

**Invariant**

| Redis Key         | Responsibility             |
| ----------------- | -------------------------- |
| `drivers:geo`     | ONLY AVAILABLE drivers     |
| `drivers:status`  | AVAILABLE / BUSY / OFFLINE |
| `driver:online:*` | TTL heartbeat              |

**Rule:**
A driver **must not** exist in `drivers:geo` unless status = `AVAILABLE`.

**Enforcement**

* Drivers are **removed** from GEO immediately when:

  * Assigned (BUSY)
  * Marked OFFLINE
* Enforced in `RedisService`
* Protected by Jest regression tests

**Rationale**

* Prevents “ghost drivers”
* Eliminates false positives in GEO search
* Keeps assignment logic simple and fast

---

### ADR-004: Stateless Service + PM2 Cluster Mode

**Decision**

* All application instances are stateless
* PM2 runs in **cluster mode**
* Shared Redis + PostgreSQL backing

**Rationale**

* Enables horizontal scaling
* Simplifies deployment
* Avoids sticky sessions or instance affinity

**Operational Guarantees**

* Safe to add/remove instances
* Graceful shutdown supported (SIGTERM)
* No in-memory state loss

---

### ADR-005: Idempotency via PostgreSQL, Not Redis

**Decision**

* Idempotency enforced using PostgreSQL constraints and queries
* Example: `sellerOrderId` uniqueness

**Rationale**

* Vendure retries events
* Redis TTLs are not durable enough for idempotency
* Database constraints provide absolute safety

**Effect**

* Duplicate webhook calls are safe
* Assignment logic is deterministic
* No double-assignment possible

---

### ADR-006: Redis Failure Must Degrade Gracefully

**Decision**
When Redis is unavailable:

* Assignment falls back to PostgreSQL
* Distance calculated in application layer
* System continues to function (with reduced performance)

**Rationale**

* Availability > performance
* Avoid total outage on Redis failure

---

## 5. Core Flows

### 5.1 Order → Driver Assignment (Happy Path)

1. Vendure emits `seller-order-ready`
2. Driver service receives webhook
3. Idempotency check in PostgreSQL
4. Redis GEO search for nearest available driver
5. Driver marked BUSY (removed from GEO)
6. Assignment persisted in PostgreSQL
7. Delivery event emitted back to Vendure

---

### 5.2 Retry & Idempotency Flow

* Vendure retries webhook
* Service checks PostgreSQL for existing delivery
* Existing assignment returned
* No state mutation occurs

(See `docs/retry-idempotency.mmd`)

---

### 5.3 Redis Degradation Flow

* Redis unavailable or error
* System logs degradation
* PostgreSQL fallback logic used
* Assignment proceeds with reduced performance

---

## 6. Failure Modes & Mitigations

| Failure            | Mitigation            |
| ------------------ | --------------------- |
| Redis down         | PostgreSQL fallback   |
| Vendure retries    | Idempotency via DB    |
| Service crash      | Stateless restart     |
| Partial Redis data | Strict GEO invariant  |
| Multiple instances | Shared backing stores |

---

## 7. Observability & Operations

* `/health` endpoint exposes:

  * Database status
  * Redis status
* Docker healthcheck wired to `/health`
* PM2 memory and restart policies
* Structured logging (Winston)

---

## 8. Trade-offs

### Accepted Trade-offs

* Slightly more complex Redis logic for correctness
* Slower fallback path during Redis outages

### Explicitly Rejected

* Redis as source of truth
* In-memory driver state
* Eventual consistency for assignments

---

## 9. Security Considerations

* Webhook secrets validated
* No trust in external retries
* No sensitive data stored in Redis
* Database credentials via environment variables

---

## 10. Future Considerations (Non-Goals for v1)

* Driver acceptance workflow
* Multi-stop routing
* Load-based driver scoring
* Sharded Redis GEO sets

---

## 11. Summary

This architecture prioritizes:

* **Correctness**
* **Determinism**
* **Operational safety**

Redis accelerates.
PostgreSQL decides.
Failures degrade safely.

The system is **GA-ready**, horizontally scalable, and resilient under retries and partial failures.

---

If you want next, I can:

* Produce **ADR-002…ADR-010** as separate files
* Generate a **Vendure plugin integration ADR**
* Create an **SRE runbook**
* Add **architecture validation tests**

You’ve built this the *right* way.
