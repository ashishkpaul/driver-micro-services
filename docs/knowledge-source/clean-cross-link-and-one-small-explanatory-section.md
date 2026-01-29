Got it 👍
You don’t need a rewrite — you just need a **clean cross-link and one small explanatory section** so readers can *discover* the retry/idempotency guarantees without bloating the README.

Below is your **fully updated README.md**, with **minimal, intentional additions**:

* ✅ Cross-links to the **Retry & Idempotency Mermaid diagram**
* ✅ Points to `docs/` without duplicating content
* ✅ Stays consistent with INSTALLATION-CONFIGURATION.md
* ✅ Keeps README high-level (as it should be)

You can **replace your README.md verbatim** with this.

---

# **Driver Management & Delivery Orchestration Microservice**

## Overview

This repository contains the **Driver Management & Delivery Orchestration Microservice** for Vendure-based commerce systems.

It is a **production-ready NestJS service** responsible for:

* Managing delivery drivers
* Tracking real-time availability and location
* Assigning the **nearest available driver** to delivery orders

The service is **GA-ready (v1.0.0)** and designed for **horizontal scalability**, **operational safety**, and **correctness under load**.

> **Default Port:** `3001`

---

## Key Capabilities

### 🚚 Driver Availability & Assignment

* Register and manage delivery drivers
* Track real-time driver location and heartbeat
* Redis-backed **GEO-based nearest-driver search**
* Strict availability invariants
  *(BUSY / OFFLINE drivers are never returned)*

---

### ⚡ Performance & Scalability

* Redis GEO indexes for **O(log N)** proximity search
* Redis pipelines to eliminate **N+1 query patterns**
* **PM2 cluster mode** for multi-core utilization
* Stateless workers with shared Redis/PostgreSQL backing

---

### 🧠 Correctness Guarantees

* PostgreSQL remains the **source of truth**
* Redis is a **performance & availability layer only**
* Strong invariants enforced by automated tests
* Safe fallback logic when Redis is unavailable

---

### 🧪 Production Safety

* Health checks for **PostgreSQL and Redis**
* Graceful shutdown (**SIGTERM-aware**)
* Docker healthcheck wired to `/health`
* Memory limits and restart policies via PM2

---

## Architecture Overview

```
Vendure ──▶ Events/Webhooks ──▶ Driver Service ──▶ Redis (GEO + Status)
                                  │
                                  └────────────▶ PostgreSQL (Source of Truth)
```

### Technology Stack

* **Framework**: NestJS
* **Database**: PostgreSQL + TypeORM
* **Availability & Geo Search**: Redis (GEO)
* **Process Manager**: PM2 (cluster mode)
* **Containerization**: Docker
* **Testing**: Jest

---

## Project Directory Structure

```text
.
├── docker-compose.yml
├── ecosystem.config.cjs
├── eslint.config.js
├── jest.config.js
├── LICENSE
├── package.json
├── README.md
├── src
│   ├── app.module.ts
│   ├── main.ts
│   ├── assignment
│   ├── config
│   ├── deliveries
│   ├── drivers
│   ├── events
│   ├── health
│   ├── redis
│   └── webhooks
└── tsconfig.json
```

---

## Core Modules

### Drivers Module

* Driver registration and lifecycle
* Location updates
* Availability and status transitions

---

### Assignment Module

* Nearest-driver selection
* **Redis GEO-based lookup**
* **PostgreSQL fallback with distance calculation** when Redis is unavailable

---

### Redis Module

* GEO index for **available drivers only**
* Driver status tracking
* Online heartbeat with TTL
* Pipeline-optimized batch operations

---

### Deliveries Module

* Delivery creation and state transitions
* Driver assignment linkage
* Delivery event tracking

---

### Health Module

* `GET /health`
* PostgreSQL connectivity check
* Redis connectivity check
* Used by Docker, PM2, and orchestration systems

---

## Redis Availability Model (GA Invariant)

| Redis Key         | Responsibility             |
| ----------------- | -------------------------- |
| `drivers:geo`     | **ONLY AVAILABLE drivers** |
| `drivers:status`  | AVAILABLE / BUSY / OFFLINE |
| `driver:online:*` | TTL-based online heartbeat |

**Invariant:**
BUSY or OFFLINE drivers are **immediately removed** from the GEO set.

This invariant is enforced by:

* RedisService implementation
* Jest regression tests

---

## Retry & Idempotency Guarantees

Vendure may **retry events** (network timeouts, webhook retries).
The driver service is **fully idempotent** and safe under retries.

**Key guarantees:**

* Idempotency is enforced using **PostgreSQL (`sellerOrderId`)**
* Redis is **never** used as an idempotency source
* Duplicate assignments are impossible
* Retries return deterministic responses

📄 **Detailed sequence diagrams and retry behavior:**
→ `docs/retry-idempotency.mmd`
→ `docs/architecture.md`

---

## Running the Service

### Development

```bash
npm install
npm run start:dev
```

---

### Production (PM2 Cluster)

```bash
npm run build
pm2 start ecosystem.config.cjs
```

---

### Verify

```bash
pm2 list
curl http://localhost:3001/health
```

Expected:

```json
{
  "status": "ok",
  "info": {
    "database": { "status": "up" },
    "redis": { "status": "up" }
  }
}
```

---

## Environment Variables

```env
# Application
PORT=3001
NODE_ENV=production

# Database
DB_HOST=localhost
DB_PORT=5432
DB_NAME=driver_service
DB_USERNAME=driver_user
DB_PASSWORD=********
DB_SYNCHRONIZE=false

# Redis
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=********

# Webhooks
VENDURE_WEBHOOK_SECRET=********
DRIVER_WEBHOOK_SECRET=********
```

> Full installation and environment setup instructions are documented in
> **INSTALLATION-CONFIGURATION.md**

---

## Testing

```bash
npm test
npm run test:cov
```

Critical Redis invariants covered by tests:

* GEO set consistency
* Status transitions (AVAILABLE → BUSY / OFFLINE)
* Pipeline usage (no N+1 calls)
* Radius safety limits

---

## Production Deployment Notes

* Designed for **PM2 cluster mode**
* No in-memory state (safe horizontal scaling)
* Redis shared across all workers
* Graceful shutdown supported (SIGTERM)

For full deployment steps, see **INSTALLATION-CONFIGURATION.md**.

---

## Release Status

* **Current Version**: `v1.0.0`
* **Stability**: General Availability (GA)
* **Backward Compatibility**: Guaranteed for v1 APIs

---

## Design Principles

* **Correctness over cleverness**
* **Fail safe, not fail silent**
* **Redis accelerates, PostgreSQL decides**
* **Every invariant must be testable**

---

## License

MIT License

---

### ✅ What this achieves

* README stays **high-level**
* Diagrams live in `docs/`
* Retry/idempotency is **discoverable**
* Zero duplication with INSTALLATION-CONFIGURATION.md
* Auditor/SRE friendly

If you want next, I can:

* Generate `docs/architecture.md` (formal ADR-style)
* Add a **Vendure plugin integration diagram**
* Produce **v1.0.0 release notes**
* Create an **ops runbook**

You’ve reached a very clean GA baseline.
