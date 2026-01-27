# Driver Management & Delivery Orchestration Microservice

## Overview

This repository contains the **Driver Management & Delivery Orchestration Microservice** for Vendure-based commerce systems. It is a **production-ready NestJS service** responsible for managing drivers, tracking real-time availability, and assigning the nearest available driver to delivery orders.

The service is **GA-ready (v1.0.0)** and designed for **horizontal scalability**, **operational safety**, and **correctness under load**.

---

## Key Capabilities

### 🚚 Driver Availability & Assignment

* Register and manage delivery drivers
* Track real-time driver location and heartbeat
* Redis-backed **GEO-based nearest-driver search**
* Strict availability invariants (BUSY/OFFLINE drivers are never returned)

### ⚡ Performance & Scalability

* Redis GEO indexes for O(log N) proximity search
* Redis pipelines to eliminate N+1 query patterns
* PM2 **cluster mode** for multi-core utilization
* Graceful degradation when Redis is unavailable

### 🧠 Correctness Guarantees

* PostgreSQL remains the **source of truth**
* Redis is a **performance and availability layer only**
* Strong invariants enforced by automated tests
* Safe fallback logic when Redis is down

### 🧪 Production Safety

* Health checks for DB and Redis
* Graceful shutdown (SIGTERM-aware)
* Docker healthcheck wired to `/health`
* Memory limits and restart policies

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
* **Cache / Geo Search**: Redis (GEO)
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

### Assignment Module

* Nearest-driver selection
* Redis GEO–based lookup
* PostgreSQL fallback with distance calculation

### Redis Module

* GEO index for available drivers
* Status and online heartbeat tracking
* Strict availability invariants

### Deliveries Module

* Delivery creation and state transitions
* Assignment linking
* Delivery event tracking

### Health Module

* `/health` endpoint
* Database connectivity checks
* Redis connectivity checks

---

## Redis Availability Model (GA Invariant)

| Redis Key         | Responsibility             |
| ----------------- | -------------------------- |
| `drivers:geo`     | **Only AVAILABLE drivers** |
| `drivers:status`  | AVAILABLE / BUSY / OFFLINE |
| `driver:online:*` | TTL-based heartbeat        |

**Invariant:** BUSY or OFFLINE drivers are immediately removed from the GEO set.

This invariant is enforced by:

* RedisService implementation
* Jest regression tests

---

## Running the Service

### Development

```bash
npm install
npm run start:dev
```

### Production (PM2 Cluster)

```bash
npm run build
pm2 start ecosystem.config.cjs
```

### Verify

```bash
pm2 list
curl http://localhost:3001/health
```

---

## Environment Variables

```env
PORT=3001
DB_HOST=localhost
DB_PORT=5432
DB_NAME=vendure
DB_USERNAME=vendure
DB_PASSWORD=********
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=********
```

---

## Testing

```bash
npm test
npm run test:cov
```

Critical Redis invariants are covered by unit tests:

* GEO set consistency
* Status transitions
* Pipeline usage
* Radius safety limits

---

## Release Status

* **Current GA Version**: `v1.0.0`
* **Stability**: Production-ready
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
