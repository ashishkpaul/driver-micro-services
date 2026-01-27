Perfect — below is a **complete, GA-correct, copy-pasteable replacement** for
`INSTALLATION-CONFIGURATION.md`, aligned **exactly** with your current codebase, Redis design, PM2 cluster setup, ports, health checks, and migrations.

This version **removes all stale assumptions** and reflects **what you actually shipped in v1.0.0**.

---

````markdown
# Installation & Configuration

Driver Management & Delivery Orchestration Microservice  
**Version:** v1.0.0 (GA)  
**Last Updated:** January 27, 2026

---

## 📌 Overview

This document explains **how to install, configure, and run** the Driver Microservice in:

- Local development
- Docker-based environments
- Production (PM2 cluster mode)

The service is **production-ready**, uses **Redis for driver availability**, and **PostgreSQL as the source of truth**.

---

## ✅ Prerequisites

### Required
- **Node.js 18+**
- **npm**
- **PostgreSQL 16+**
- **Redis 6.2+**
- **Git**

### Recommended (Production)
- **Docker & Docker Compose**
- **PM2 (`npm install -g pm2`)**

---

## ⚠️ Important Invariants (Read First)

1. **Service runs on port `3001`**
2. **Redis is REQUIRED** for driver availability & assignment
3. **PostgreSQL is the source of truth**
4. **Redis is a performance layer (GEO + TTL)**
5. **Migrations must be run** (`DB_SYNCHRONIZE=false`)
6. **PM2 cluster mode is safe** (no in-memory state)
7. **Redis failures degrade gracefully** (DB fallback)

---

## 🔐 Environment Configuration

Create a `.env` file (or `.env.production`):

```env
# Application
NODE_ENV=development
PORT=3001

# Database (PostgreSQL)
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=driver_user
DB_PASSWORD=driver_password
DB_NAME=driver_service
DB_SYNCHRONIZE=false
DB_LOGGING=true

# Redis (REQUIRED)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_strong_password
REDIS_DB=1

# Webhooks
VENDURE_WEBHOOK_SECRET=vendure_secret_change_me
DRIVER_WEBHOOK_SECRET=driver_secret_change_me
````

---

## 🚀 Quick Start (Docker – Recommended)

### 1️⃣ Clone Repository

```bash
git clone <repository-url>
cd driver-micro-services
```

### 2️⃣ Start Dependencies

```bash
docker-compose up -d
```

Ensure **PostgreSQL** and **Redis** are healthy.

### 3️⃣ Install Dependencies

```bash
npm install
```

### 4️⃣ Run Migrations

```bash
npm run compile:migrations
npm run migration:run
```

### 5️⃣ Start Service (Dev)

```bash
npm run start:dev
```

Expected log:

```
Driver Service running on port 3001
Redis connected
```

---

## 🛠 Manual Installation (Without Docker)

### PostgreSQL Setup

```sql
CREATE USER driver_user WITH PASSWORD 'driver_password';
CREATE DATABASE driver_service OWNER driver_user;
GRANT ALL ON SCHEMA public TO driver_user;
```

### Redis Setup

```bash
redis-server --requirepass your_strong_password
```

Verify:

```bash
redis-cli -a your_strong_password ping
```

---

## 📦 Production Deployment (PM2 Cluster Mode)

### 1️⃣ Build

```bash
npm run build
```

### 2️⃣ Start Cluster

```bash
pm2 start ecosystem.config.cjs
```

### 3️⃣ Verify

```bash
pm2 list
pm2 logs driver-service
```

### PM2 Guarantees

* Cluster mode (`instances: max`)
* Graceful shutdown (`SIGTERM`)
* Redis shared across workers
* Automatic restart on crash
* Memory cap (512MB)

---

## 🩺 Health Checks

### Endpoint

```http
GET /health
```

### Checks Included

* PostgreSQL connectivity
* Redis connectivity

Example response:

```json
{
  "status": "ok",
  "info": {
    "database": { "status": "up" },
    "redis": { "status": "up" }
  }
}
```

Used by:

* Docker healthcheck
* PM2 monitoring
* Kubernetes probes

---

## 🧠 Redis Architecture (GA Invariant)

Redis is used **only for availability & proximity**.

### Keys

| Key                  | Purpose                                |
| -------------------- | -------------------------------------- |
| `drivers:geo`        | GEO index (**ONLY AVAILABLE drivers**) |
| `drivers:status`     | Driver status                          |
| `driver:online:{id}` | TTL heartbeat                          |

### Rules

* BUSY / OFFLINE drivers **must not exist in GEO**
* Redis writes happen **before DB writes**
* DB fallback is used if Redis is unavailable

---

## 🗄 Database & Migrations

* Migrations are mandatory
* Schema uses `snake_case`
* Entities map via explicit column names
* `DB_SYNCHRONIZE` **must be false**

Run migrations:

```bash
npm run migration:run
```

Verify:

```bash
psql -d driver_service -c "\d drivers"
```

---

## 🧪 Tests & Quality

### Run Tests

```bash
npm test
```

### Redis Invariant Tests

```bash
npm test -- src/redis/redis.service.spec.ts
```

### Type Checking

```bash
npx tsc --noEmit
```

---

## 🌐 API Endpoints

### Health

```
GET /health
```

### Drivers

```
POST    /drivers
GET     /drivers
GET     /drivers/available
GET     /drivers/:id
PATCH   /drivers/:id/location
PATCH   /drivers/:id/status
DELETE  /drivers/:id
```

### Deliveries

```
POST    /deliveries
GET     /deliveries
GET     /deliveries/:id
PATCH   /deliveries/:id/assign
PATCH   /deliveries/:id/status
```

### Webhooks

```
POST /events/seller-order-ready
POST /webhooks/driver-events
```

---

## 🔗 Vendure Integration

Configure webhook in Vendure:

```
URL: http://<host>:3001/events/seller-order-ready
Secret: VENDURE_WEBHOOK_SECRET
```

---

## 🚨 Troubleshooting

### Redis Down

* Service continues
* Falls back to PostgreSQL
* Assignment may be slower

### No Drivers Returned

* Ensure drivers are AVAILABLE
* Ensure location is set
* Ensure Redis GEO contains only AVAILABLE drivers

### Port Conflicts

```bash
lsof -i :3001
```

---

## 🔐 Production Checklist

* [ ] Strong DB passwords
* [ ] Strong Redis password
* [ ] Secure webhook secrets
* [ ] HTTPS via reverse proxy
* [ ] Backups enabled
* [ ] Monitoring enabled

---

## 📄 License

MIT License — see `LICENSE`

---

**Status:** GA-ready
**Validated with:** Node 18, PostgreSQL 16, Redis 6.2, PM2 Cluster

```

---

## ✅ What This File Now Guarantees

- Matches **v1.0.0 code exactly**
- Documents **Redis correctly**
- Documents **PM2 cluster mode**
- Uses the **correct port (3001)**
- No warnings about already-fixed bugs
- Safe for onboarding & ops

Just say the word.
```
