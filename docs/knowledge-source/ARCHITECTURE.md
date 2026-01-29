Perfect. Below is a **formal, GA-quality `ARCHITECTURE.md`** that is **fully consistent** with:

* your **actual driver-micro-services code**
* Redis invariants you enforce with tests
* Vendure plugins (`driver-integration`, `seller-store-info`)
* PM2 cluster + Docker deployment
* current `README.md` and `INSTALLATION-CONFIGURATION.md`

This is **copy-paste ready** as `ARCHITECTURE.md`.

---

# **ARCHITECTURE.md**

## Driver Management & Delivery Orchestration Microservice

**Version:** v1.0.0 (GA)
**Status:** Production Ready

---

## 1. Purpose & Scope

The **Driver Management & Delivery Orchestration Microservice** is a standalone NestJS service responsible for:

* Managing delivery drivers
* Tracking real-time driver availability and location
* Assigning the nearest available driver to a Vendure order
* Acting as a decoupled orchestration layer between Vendure and delivery drivers

This service is **intentionally isolated** from Vendure core logic and follows strict boundaries to ensure correctness, scalability, and operational safety.

---

## 2. High-Level Architecture

```
Vendure Core
   │
   │ SellerOrderReady
   ▼
Vendure Plugins
(driver-integration,
 seller-store-info)
   │ Webhooks
   ▼
Driver Microservice
   ├── Redis (GEO + availability cache)
   └── PostgreSQL (source of truth)
```

### Architectural Roles

| Component           | Responsibility                            |
| ------------------- | ----------------------------------------- |
| Vendure Core        | Order lifecycle and state                 |
| Vendure Plugins     | Event translation and webhook dispatch    |
| Driver Microservice | Driver state, availability, assignment    |
| Redis               | High-performance geo & availability layer |
| PostgreSQL          | Authoritative persistence                 |

---

## 3. Design Principles

### 3.1 Core Principles

* **Correctness over cleverness**
* **Fail safe, not fail silent**
* **Redis accelerates, PostgreSQL decides**
* **Every invariant must be testable**

### 3.2 Explicit Non-Goals (v1)

* No driver acceptance / rejection workflow
* No reassignment once a driver is assigned
* No batching or pooling of deliveries
* No long-running workflows inside Redis

---

## 4. Source of Truth Model

### PostgreSQL (Authoritative)

PostgreSQL is the **single source of truth** for:

* Driver identity
* Driver status (`AVAILABLE`, `BUSY`, `OFFLINE`)
* Assignments
* Deliveries
* Audit and history

### Redis (Performance Layer)

Redis is used **only** to:

* Accelerate nearest-driver lookup
* Track ephemeral online heartbeat
* Reduce database load under high concurrency

Redis **must never** be trusted for correctness alone.

---

## 5. Redis Availability Model (Critical)

### Redis Keys

| Key                  | Purpose                             |
| -------------------- | ----------------------------------- |
| `drivers:geo`        | GEO index of AVAILABLE drivers only |
| `drivers:status`     | Driver status cache                 |
| `driver:online:{id}` | TTL-based heartbeat                 |

### Hard Invariants (GA-Enforced)

```text
Invariant 1:
drivers:geo contains ONLY drivers with status AVAILABLE

Invariant 2:
BUSY or OFFLINE drivers are removed immediately from drivers:geo

Invariant 3:
Redis failure does NOT block assignment

Invariant 4:
PostgreSQL remains authoritative
```

These invariants are enforced by:

* RedisService implementation
* Jest regression tests
* Assignment logic

---

## 6. Driver Assignment Flow

### 6.1 Happy Path (Redis Available)

1. Vendure emits `SellerOrderReady`
2. Vendure plugin sends webhook to Driver Service
3. Driver Service queries Redis GEO index
4. Nearest AVAILABLE driver selected
5. Driver removed from Redis GEO set
6. Driver marked BUSY
7. Assignment persisted in PostgreSQL
8. Vendure notified via webhook

### 6.2 Degraded Path (Redis Unavailable)

1. Redis GEO lookup fails
2. Service queries PostgreSQL for AVAILABLE drivers
3. In-memory Haversine distance calculation
4. Nearest driver selected
5. Assignment persisted
6. System continues safely

**Result:** No outage, only reduced performance.

---

## 7. Failure Handling Strategy

### Redis Failure

* Logged as warning
* Service continues in degraded mode
* No crashes
* No incorrect assignments

### Database Failure

* Assignment blocked
* Health endpoint reports failure
* Kubernetes / PM2 can restart safely

### Partial Failure

* Health endpoint exposes granular state
* `/health` includes DB + Redis status

---

## 8. Concurrency & Scaling Model

### Stateless Service

* No in-memory state relied upon
* All critical state externalized

### Horizontal Scaling

* PM2 cluster mode
* Multiple Node.js workers
* Redis shared across workers
* PostgreSQL transactional safety

### Safety Guarantees

* Assignment operations are idempotent
* Redis GEO mutations are atomic per driver
* Race conditions avoided via removal from GEO index

---

## 9. Health & Observability

### Health Endpoint

```
GET /health
```

Reports:

* Database connectivity
* Redis connectivity

### Logging

* Winston structured logging
* Error and combined logs
* PM2 log aggregation

### Docker & PM2

* Docker healthcheck wired to `/health`
* PM2 memory caps
* Graceful SIGTERM handling

---

## 10. Security Model

* Webhook secrets for Vendure → Driver Service
* Webhook secrets for Driver App → Driver Service
* Helmet, CORS, validation pipes
* No public unauthenticated mutation endpoints

---

## 11. Module Responsibilities

### Drivers Module

* Driver lifecycle
* Status updates
* Location updates

### Assignment Module

* Nearest-driver selection
* Redis / DB coordination
* Assignment persistence

### Redis Module

* GEO index management
* Availability invariants
* Heartbeat tracking

### Deliveries Module

* Delivery records
* Status transitions
* Assignment linkage

### Health Module

* System health reporting
* Kubernetes / Docker integration

---

## 12. Versioning & Compatibility

* **Current Version:** v1.0.0
* Backward-compatible within v1
* v2 planned for:

  * Driver acceptance workflow
  * Reassignment logic
  * Retry semantics

---

## 13. Why This Architecture Works

✔ Proven under concurrency
✔ Safe under partial failures
✔ Easy to reason about
✔ Easy to test
✔ Easy to extend

This architecture intentionally trades **feature richness** for **predictability and correctness**, which is exactly what a delivery orchestration system requires at scale.

---

## 14. References

* `README.md` – overview & usage
* `INSTALLATION-CONFIGURATION.md` – setup & deployment
* `docs/sequence-vendure-driver.mmd` – runtime flow
* `RedisService.spec.ts` – invariant enforcement

---

**End of document.**

---

If you want next, I can:

* Cross-link this into `README.md`
* Generate a **v2 architecture appendix**
* Add **ADR (Architecture Decision Records)**
* Produce **contract schemas** for Vendure ↔ Driver

Just tell me 👍
